"""The AI producer: an LLM picks the genre feel, the instruments, and when and where they play.

Genre profiles (genres.py) tell the model how each style is produced. Optional
Tavily web research adds concrete details about the style the user asks for.
"""
import json
import re

from . import genres, llm, research
from .arrange import _brief_wishes, rule_based_plan
from .genres import GENRES
from .instruments import CATALOG, catalog_prompt
from .llm import LLMError
from .patch import patch_prompt
from .plan_schema import PlanError, compute_sections, diff_plans, rescale_regions, sanitize_plan

_PROMPT = """You are gRave's producer: a versatile, top-tier music producer who makes ANY genre (trap, drill, boom bap,
lo-fi, R&B, pop, house, afrobeats, reggaeton, cinematic horror...). gRave has a Halloween personality, but the GENRE
decides the sound: a pop beat must sound like pop, boom bap like boom bap, house like house. You build a beat around ONE
vocal take: you choose WHICH instruments to use, then WHEN and WHERE each one plays, using the vocal's measured
telemetry, the genre and the user's brief.

GENRES (id: name, usual tempo, feel)
{GENRES}

STEP 1 - GENRE. Use the GENRE in the request and follow its PROFILE (drum patterns, swing, instruments, chords).
If the request says auto, pick the best-fitting id for this vocal and brief and return it in "genre".
STEP 2 - PALETTE. Pick 4-9 instruments that fit the genre, the vocal and the brief: from the CATALOG and/or CUSTOM
instruments you design (up to 3). Different genres and different vocals must get clearly different palettes. Use a
catalog instrument twice only for a different role (give the second an id like "piano_2"). Design a custom
instrument whenever the brief describes a sound the catalog lacks.
STEP 3 - ARRANGEMENT. For every instrument, choose the bar regions and the pattern inside them.

TELEMETRY (JSON you receive)
- bpm: the beat tempo, locked to the vocal (it may be half or double the measured vocal tempo, detected_bpm)
- key, mode, brightness_hz (spectral centroid; low = dark/murky, high = airy), duration_sec, bars, offset_sec
- bar_levels[i]: vocal loudness 0-1 in bar i+1 (0 = the vocal rests)
- bar_onsets[i]: 16th-note steps 0-15 in bar i+1 where a syllable starts
- bar_notes[i]: dominant sung note in bar i+1, semitones above the key root (0-11), or null
- sections: auto-detected intro/verse/hook/break/outro as {name,start_bar,end_bar}

CATALOG (id (kind): sound. params with ranges)
{CATALOG}

{CUSTOM}

PATTERN BY KIND
- hits:      {"steps":[0-15...], "fill_steps":[optional, replaces steps in every 4th bar of the region]}
- melodic:   {"steps":[...], "degrees":[scale degree per step, same length], "fill_steps":[...]}
             degrees: 0 = key root, 2 = third, 4 = fifth, 7 = octave up, negative = below
- chords:    {"degrees":[chord root degree for each 2 bars, cycling]}   e.g. pop major [0,4,5,3]
- sustained: {} (plays through the whole region)
Steps: 0 = beat 1, 4 = beat 2, 8 = beat 3, 12 = beat 4. Backbeat = 4 and 12. Half-time snare = 8 only.

OUTPUT: exactly one JSON object, no markdown:
{
  "genre": "genre id",
  "swing": 0-0.6 (delays off-beat notes for a laid-back shuffle; boom bap and lo-fi about 0.5, trap, drill and pop 0),
  "summary": "1-2 sentences: how you read the vocal",
  "palette_reason": "why THESE instruments for THIS genre, vocal and brief",
  "reply": "chat message to the user: what you built and why, plain language, cite real numbers",
  "tempo_bpm": optional integer 60-200 (only when the user asks for a different tempo),
  "layers": [
    {"instrument": "catalog id, or custom (then add kind, role and patch)", "id": "optional stable id", "volume": 0.05-1.2,
     "reason": "the job of this instrument in the track",
     "params": {"param": value},
     "regions": [{"start_bar": 1, "end_bar": 4, "why": "why exactly here", "pattern": {...}}]}
  ]
}
Bars are 1-based and inclusive (1..bars). Regions of one layer must not overlap.

CRAFT RULES
- The user's brief is the priority. If it names instruments, a mood or a style, follow it exactly.
- Stay true to the genre's drums and feel. Only horror_trap and cinematic are meant to be scary; for other genres add at
  most ONE subtle Halloween touch (a bell, a ghostly pad) and only if it fits.
- Leave room for the voice: put kick, 808, bass, clap and snare hits on steps where the vocal is NOT starting syllables
  (bar_onsets) unless the genre's groove requires them (four-on-the-floor kick, dembow). Thin out during loud bars.
- Build energy: sparse intro, groove in verses, full power in hooks, ease off in breaks and the outro.
- Use silence. Not every instrument plays everywhere. Vary patterns between verse and hook.
- Melodic layers answer the vocal in its rests and agree with bar_notes.
- noise_riser goes in the bar(s) right before a hook; impact on step 0 of a hook's first bar.
- If STYLE RESEARCH is provided, use it for instruments, drum feel and tempo typical of that style, translated into
  this catalog. If the style needs an instrument the catalog lacks, design a custom one.
"""
CUSTOM_HINT = re.compile(
    r"\b(design|invent|custom|craft|new (instrument|sound)|signature sound|never heard|unique sound|weird sound|"
    r"rust\w*|chainsaw|whisper\w*|cursed instrument)\b",
    re.IGNORECASE,
)


def system_prompt(detailed=None, full_custom: bool = True) -> str:
    """The producer's system prompt. `detailed` limits full catalog entries to those ids."""
    return (
        _PROMPT.replace("{GENRES}", genres.genres_prompt())
        .replace("{CATALOG}", catalog_prompt(detailed))
        .replace("{CUSTOM}", patch_prompt(full_custom))
    )


SYSTEM_PROMPT = system_prompt()  # full version, for reference and tests


def _focus(genre_ids, text: str, plan: dict | None = None) -> set[str]:
    """Catalog ids worth describing in full: the genres' instruments, any named in the text, and the current plan's."""
    ids = set()
    for gid in genre_ids:
        ids.update(genres.instruments_of(gid))
    ids.update(_brief_wishes(text)[0])
    t = (text or "").lower()
    for iid, c in CATALOG.items():
        if iid.replace("_", " ") in t or c["name"].lower() in t:
            ids.add(iid)
    if plan:
        ids.update(l["instrument"] for l in plan["layers"] if l["instrument"] in CATALOG)
    ids.update(("noise_riser", "impact"))
    return ids


def _wants_custom(text: str, plan: dict | None = None) -> bool:
    return bool(CUSTOM_HINT.search(text or "")) or bool(plan and any(l.get("patch") for l in plan["layers"]))

REVISE_ADDENDUM = """
You are REVISING an existing plan. Apply the user's request to CURRENT PLAN and return the COMPLETE updated plan
in the same JSON format (not a diff), including "genre" and "swing". Keep the "id" of every layer you keep. Keep
everything the user did not mention unchanged. You may add instruments from the catalog, remove them, or swap one for
another (e.g. "swap the piano for a music box" = remove piano, add music_box in the same regions). To change how a
CUSTOM instrument sounds ("make the bell rustier", "darker", "more echo"), edit its patch and keep its id. When the
genre changes, rebuild the palette, drum patterns, chords and swing for the new genre. In "reply", explain what you
changed and why. The vocal is never time-stretched: only set tempo_bpm when the user asks for a tempo, and prefer half
or double the current bpm so the beat stays in sync with the voice. Keep bar numbers as in the current plan; the
server rescales them.
"""

NO_LLM_NOTICE = (
    "No AI model is configured, so I used the built-in rule-based producer. "
    "It follows the genre and simple keywords in your brief. Add a GROQ_API_KEY to backend/.env for the full AI producer."
)


def extract_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise PlanError("The model did not return a JSON object.")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as e:
        raise PlanError(f"The model returned invalid JSON ({e.msg}).") from None


def _telemetry(a: dict) -> str:
    keep = ("bpm", "detected_bpm", "key", "mode", "brightness_hz", "duration_sec", "bars", "offset_sec",
            "bar_levels", "bar_onsets", "bar_notes")
    data = {k: a[k] for k in keep if k in a}
    data["bar_levels"] = [round(v, 2) for v in a["bar_levels"]]  # 2 decimals is plenty, saves tokens
    data["sections"] = compute_sections(a["bar_levels"])
    return json.dumps(data, separators=(",", ":"))


def _research_block(found: dict | None) -> str:
    if not found or not found.get("notes"):
        return ""
    return f"\n\nSTYLE RESEARCH (from the web, may be imperfect):\n{found['notes']}"


def _public_research(found: dict | None) -> dict | None:
    """What the frontend may see: the query and sources."""
    if not found:
        return None
    if found.get("error"):
        return {"error": found["error"]}
    return {"query": found["query"], "sources": found["sources"]}


def _ask_plan(system: str, user: str, build) -> object:
    """Ask the model for a plan; if it is unusable, let it fix the mistake once.

    `build(obj)` turns the parsed JSON into the final result and raises PlanError
    when the plan is not acceptable.
    """
    err = None
    for _ in range(2):
        prompt = user if err is None else (
            f"{user}\n\nYour previous answer was rejected: {err}\nReturn corrected JSON only."
        )
        try:
            return build(extract_json(llm.complete(system, prompt)))
        except PlanError as e:
            err = str(e)
    raise PlanError(err or "The model did not produce a usable plan.")


def _fit(analysis: dict, gid: str, reanalyze) -> dict:
    """Fold the beat tempo to half/double time when that suits the genre better."""
    target = genres.fit_tempo(gid, analysis["bpm"])
    return reanalyze(target) if target != analysis["bpm"] else analysis


def _rescaled(obj: dict, old: dict, new: dict) -> dict:
    return rescale_regions(obj, new["bpm"] / old["bpm"]) if new["bpm"] != old["bpm"] else obj


def produce(analysis: dict, brief: str, genre: str, reanalyze) -> dict:
    """Return {analysis, plan, source, model, notice, research}. Falls back to rules if the AI fails.

    `genre` is a genre id or "auto". `reanalyze(bpm)` re-measures the vocal at another tempo.
    """
    chosen = genre if genres.valid(genre) else (genres.detect(brief) or genres.AUTO)
    fallback_genre = chosen if chosen != genres.AUTO else genres.guess(analysis)
    if chosen != genres.AUTO:
        analysis = _fit(analysis, chosen, reanalyze)

    cfg = llm.get_config()
    if cfg is None:
        a = _fit(analysis, fallback_genre, reanalyze)
        return {
            "analysis": a, "plan": rule_based_plan(a, brief, fallback_genre), "source": "rules",
            "model": None, "notice": NO_LLM_NOTICE, "research": None,
        }

    style = GENRES[chosen]["name"] if chosen != genres.AUTO else ""
    query = f"{style} beat {brief}".strip() if (brief.strip() or style) else ""
    found = research.research(query) if query else None
    notices = [found["error"]] if found and found.get("error") else []

    if chosen == genres.AUTO:
        genre_line = (f"GENRE: auto. Pick the best fit. Suggestion from the vocal's tempo and mood: "
                      f"{fallback_genre}.\n{genres.genre_block(fallback_genre, analysis['bpm'])}")
    else:
        genre_line = f"GENRE: {chosen} (chosen by the user, do not change it).\n{genres.genre_block(chosen, analysis['bpm'])}"
    user = (
        f"{genre_line}\n\nBRIEF FROM THE USER: {brief.strip() or '(none: let the genre and the vocal guide you)'}"
        f"{_research_block(found)}\n\nTELEMETRY: {_telemetry(analysis)}\n\nReturn the plan JSON."
    )

    def build(obj):
        g = chosen if chosen != genres.AUTO else (obj.get("genre") if genres.valid(obj.get("genre")) else fallback_genre)
        a = _fit(analysis, g, reanalyze)
        return sanitize_plan({**_rescaled(obj, analysis, a), "genre": g}, a, g), a

    gids = {chosen} if chosen != genres.AUTO else {fallback_genre, genres.detect(brief) or fallback_genre}
    system = system_prompt(_focus(gids, brief), _wants_custom(brief))
    try:
        plan, a = _ask_plan(system, user, build)
        return {
            "analysis": a, "plan": plan, "source": "ai", "model": cfg["model"],
            "notice": " ".join(notices), "research": _public_research(found),
        }
    except (LLMError, PlanError) as e:
        notices.append(f"The AI planner failed ({e}). I used the rule-based producer instead.")
        a = _fit(analysis, fallback_genre, reanalyze)
        return {
            "analysis": a, "plan": rule_based_plan(a, brief, fallback_genre), "source": "rules",
            "model": cfg["model"], "notice": " ".join(notices), "research": _public_research(found),
        }


def revise(analysis: dict, plan: dict, message: str, reanalyze) -> dict:
    """Apply a chat request to the current plan using the LLM.

    `reanalyze(bpm)` returns a new analysis when the tempo changes.
    Raises LLMError / PlanError on failure so the chat can show the reason.
    """
    current = plan.get("genre") if genres.valid(plan.get("genre")) else "horror_trap"
    old = sanitize_plan(plan, analysis, current)
    target = genres.detect_switch(message) or current
    switching = target != current

    query = ""
    if switching:
        query = f"{GENRES[target]['name']} beat {message}"
    elif research.STYLE_HINT.search(message):
        query = message
    found = research.research(query) if query else None

    genre_note = genres.genre_block(target, analysis["bpm"])
    if switching:
        genre_note = (f"The user is switching the genre from {GENRES[current]['name']} to {GENRES[target]['name']}. "
                      f"Set \"genre\": \"{target}\" and rebuild the beat for it.\n{genre_note}")
    user = (
        f"CURRENT GENRE: {current}\n{genre_note}\n\n"
        f"CURRENT PLAN: {json.dumps(_strip_plan(old), separators=(',', ':'))}"
        f"{_research_block(found)}\n\nTELEMETRY: {_telemetry(analysis)}\n\n"
        f"USER REQUEST: {message.strip()}\n\nReturn the complete updated plan JSON."
    )

    def build(obj):
        g = target if switching else (obj.get("genre") if genres.valid(obj.get("genre")) else current)
        a = analysis
        tempo = obj.get("tempo_bpm")
        if isinstance(tempo, (int, float)) and 60 <= tempo <= 200 and abs(tempo - analysis["bpm"]) >= 1:
            a = reanalyze(int(tempo))
        elif g != current:
            a = _fit(analysis, g, reanalyze)
        return sanitize_plan({**_rescaled(obj, analysis, a), "genre": g}, a, g), a

    system = system_prompt(_focus({current, target}, message, old), _wants_custom(message, old)) + REVISE_ADDENDUM
    new, new_analysis = _ask_plan(system, user, build)
    changes, changed = diff_plans(old, new)
    cfg = llm.get_config()
    return {
        "plan": new, "analysis": new_analysis, "changes": changes, "changed_ids": changed,
        "model": cfg["model"] if cfg else None, "research": _public_research(found),
    }


def _strip_plan(plan: dict) -> dict:
    """Send the model only what it needs to edit."""
    def strip(l):
        # Drop empty pattern fields and trim long text: the plan is resent on every chat turn.
        def pat(p):
            return {k: v for k, v in p.items() if v}

        out = {
            "instrument": l["instrument"], "id": l["id"], "volume": l["volume"], "reason": l["reason"][:120],
            "params": l["params"],
            "regions": [{"start_bar": r["start_bar"], "end_bar": r["end_bar"], "why": r["why"][:80],
                         "pattern": pat(r["pattern"])} for r in l["regions"]],
        }
        if l.get("patch"):
            out.update(kind=l["kind"], role=l["role"], patch=l["patch"])
        return out

    return {"genre": plan["genre"], "swing": plan["swing"], "layers": [strip(l) for l in plan["layers"]]}
