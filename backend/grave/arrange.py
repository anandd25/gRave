"""Rule-based planner: the offline fallback when the AI model is unavailable.

It still listens and follows the genre: the palette and drum patterns come from
the genre profile, the bass and melodies dodge the vocal's syllables, and simple
keywords in the brief ("piano", "no hats") are honored. The real creative
decisions come from the LLM in producer_ai.py.
"""
import copy
import random
import re

from . import genres
from .genres import GENRES
from .instruments import CATALOG
from .plan_schema import MAX_LAYERS, compute_sections, sanitize_plan

KEYWORDS = [  # (pattern in the brief, instrument)
    (r"rhodes|electric piano|\bep\b", "rhodes"),
    (r"piano|keys", "piano"),
    (r"guitar", "guitar"),
    (r"conga|bongo|percussion", "conga"),
    (r"supersaw|big chords|edm chords", "supersaw"),
    (r"synth ?bass", "synth_bass"),
    (r"church|toll", "church_bell"),
    (r"glock", "glockenspiel"),
    (r"music ?box|lullaby|nursery", "music_box"),
    (r"choir|chant|ooh", "ghost_choir"),
    (r"strings?|violin|cello|orchestra", "horror_strings"),
    (r"organ|gothic|cathedral|vampire", "haunted_organ"),
    (r"drone|ambient|doom", "horror_drone"),
    (r"toms?\b|war drums?|tribal", "toms"),
    (r"shaker", "shaker"),
    (r"reese|dnb|drum and bass", "reese_bass"),
    (r"riser|build ?up|sweep", "noise_riser"),
    (r"impact|boom\b|cinematic|trailer", "impact"),
    (r"vinyl|dusty|tape|crackle", "vinyl_crackle"),
    (r"pluck|arp", "pop_pluck"),
    (r"\blead\b", "synth_lead"),
    (r"slid(e|ing)|glid(e|ing)", "808_glide"),
    (r"distort|dirty|gritty|growl", "808_distorted"),
    (r"open hats?", "hihat_open"),
    (r"snare", "snare_trap"),
    (r"clap", "clap"),
    (r"\brim", "rimshot"),
    (r"\bpad\b", "warm_pad"),
]
ALL_HATS = ["hihat_closed", "hihat_open"]
ALL_808 = ["808_sub", "808_distorted", "808_glide"]
NEGATABLE = {  # word after "no"/"without" -> instruments to drop
    "hats": ALL_HATS, "hat": ALL_HATS, "hi-hats": ALL_HATS, "hihats": ALL_HATS,
    "808": ALL_808, "808s": ALL_808, "bass": [*ALL_808, "reese_bass", "synth_bass"],
    "drums": ["kick_punch", "kick_boom", "kick_four", "hihat_closed", "hihat_open", "shaker", "clap",
              "snare_trap", "snare_boom", "rimshot", "toms", "conga"],
    "claps": ["clap"], "clap": ["clap"], "snare": ["snare_trap", "snare_boom"], "snares": ["snare_trap", "snare_boom"],
    "piano": ["piano"], "bells": ["church_bell", "glockenspiel", "music_box"], "pad": ["dark_pad", "warm_pad"],
    "guitar": ["guitar"], "vinyl": ["vinyl_crackle"],
}
KICKS = {"kick_punch", "kick_boom", "kick_four"}
KICK_PATTERNS = [[0, 10], [0, 7, 10], [0, 7, 10, 14], [0, 3, 7, 10, 14], [0, 3, 6, 10, 12, 14]]


def _brief_wishes(brief: str) -> tuple[list[str], set[str]]:
    text = (brief or "").lower()
    banned: set[str] = set()
    for m in re.finditer(r"\b(?:no|without|remove|drop)\s+(?:the\s+)?([\w-]+)", text):
        banned.update(NEGATABLE.get(m.group(1), []))
    text_wo_neg = re.sub(r"\b(?:no|without|remove|drop)\s+(?:the\s+)?[\w-]+", " ", text)
    wanted = []
    for pat, iid in KEYWORDS:
        if re.search(pat, text_wo_neg) and iid not in wanted:
            wanted.append(iid)
    return wanted, banned


def _span(sections, names):
    return [(s["start_bar"], s["end_bar"]) for s in sections if s["name"] in names]


def _hooks(sections):
    return [s for s in sections if s["name"] == "hook"]


def _spans_for(iid, sections, bars):
    whole = [(1, bars)]
    if not any(s["name"] in ("verse", "hook") for s in sections):
        return whole
    role = CATALOG[iid]["role"]
    if iid == "noise_riser":
        spans = [(max(1, h["start_bar"] - 1), h["start_bar"] - 1) for h in _hooks(sections) if h["start_bar"] > 1]
        return spans or [(max(1, bars - 1), bars)]
    if iid == "impact":
        return [(h["start_bar"], h["start_bar"]) for h in _hooks(sections)] or [(1, 1)]
    if iid in ("hihat_closed", "shaker", "conga"):
        r = _span(sections, ["verse", "hook", "break"])
    elif iid == "hihat_open":
        r = _span(sections, ["hook"]) or _span(sections, ["verse"])
    elif iid == "toms":
        r = _span(sections, ["intro", "break", "outro"]) or _span(sections, ["hook"])
    elif role in ("bass", "drums"):
        r = _span(sections, ["verse", "hook"])
    elif iid == "church_bell":
        r = _span(sections, ["intro", "outro"]) or _span(sections, ["hook"])
    elif role == "melody":
        r = _span(sections, ["intro", "break", "outro"]) + _span(sections, ["hook"])
    elif iid in ("horror_drone", "vinyl_crackle") or role == "chords":
        r = whole
    else:
        r = whole
    return sorted(r) or whole


def _busy_steps(a, start, end):
    counts: dict[int, int] = {}
    bars = range(start - 1, min(end, len(a["bar_onsets"])))
    for b in bars:
        for s in a["bar_onsets"][b]:
            counts[s] = counts.get(s, 0) + 1
    need = max(1, len(bars) / 3)
    return {s for s, c in counts.items() if c >= need}


def _avg_onsets(a, start, end):
    bars = [len(a["bar_onsets"][b]) for b in range(start - 1, min(end, len(a["bar_onsets"])))]
    return sum(bars) / len(bars) if bars else 0.0


def _pattern(iid, a, start, end, rng, prof):
    c = CATALOG[iid]
    kind, role = c["kind"], c["role"]
    if iid in prof["patterns"]:
        return copy.deepcopy(prof["patterns"][iid]), f"Classic {prof['name']} pattern."
    if kind == "sustained":
        return {}, "Holds the atmosphere through this section."
    if kind == "chords":
        return {"degrees": list(prof["chords"][a["mode"]])}, f"{prof['name']} chord movement, one chord every 2 bars."
    busy = _busy_steps(a, start, end)
    density = _avg_onsets(a, start, end)
    if role == "bass" or iid in KICKS:
        best = min(KICK_PATTERNS, key=lambda p: (len(busy & set(p)), -len(p)))
        degrees = [0] + [rng.choice([0, 0, -2, 4, 5]) for _ in best[1:]]
        why = f"Dodges the vocal's busy steps {sorted(busy)}." if busy else "Fills the open pocket under the vocal."
        return {"steps": best, "degrees": degrees}, why
    if iid == "hihat_closed":
        steps = [2, 6, 10, 14] if density > 7 else ([0, 2, 4, 6, 8, 10, 12, 14] if density > 3 else list(range(16)))
        return {"steps": steps, "fill_steps": [8, 10, 12, 13, 14, 15]}, f"Hat density follows the vocal ({density:.1f} syllables per bar)."
    if iid == "toms":
        return {"steps": [0, 3, 6, 10], "degrees": [0, -2, -3, 0]}, "Rolling war drums build tension."
    if iid == "conga":
        return {"steps": [2, 5, 8, 11, 14], "degrees": [0, 2, 0, 4, 2]}, "Hand drums talk around the groove."
    if iid == "church_bell":
        return {"steps": [0], "degrees": [rng.choice([0, 4])]}, "One tolling note per bar."
    if kind == "melodic":
        free = [s for s in (0, 2, 3, 6, 8, 10, 11, 12, 14) if s not in busy] or [0, 6, 10]
        steps = sorted(rng.sample(free, min(len(free), rng.randint(3, 5))))
        notes = [n for n in a["bar_notes"][start - 1:end] if n is not None]
        pool = [0, 2, 4, 5, 7] + ([round(n * 7 / 12) for n in notes[:4]] if notes else [])
        return {"steps": steps, "degrees": [rng.choice(pool) for _ in steps]}, "Answers the vocal in its gaps."
    return {"steps": list(c.get("steps", [0]))}, ""


def choose_palette(prof: dict, brief: str, rng: random.Random) -> list[str]:
    wanted, banned = _brief_wishes(brief)
    palette = list(prof["core"]) + [rng.choice(opts) for opts in prof["options"]]
    ordered = []
    for iid in wanted + palette:  # brief wishes first, so they survive the layer cap
        if iid in CATALOG and iid not in ordered and iid not in banned:
            ordered.append(iid)
    return ordered[:MAX_LAYERS]


def rule_based_plan(analysis: dict, brief: str = "", genre: str = genres.AUTO) -> dict:
    a = analysis
    gid = genres.resolve(genre, brief, a)
    prof = GENRES[gid]
    seed = a["bpm"] * 1000 + a["key_pc"] * 37 + a["brightness_hz"] + sum(
        len(o) * (i + 1) for i, o in enumerate(a["bar_onsets"])
    ) + sum(ord(ch) for ch in brief + gid)
    rng = random.Random(seed)
    sections = compute_sections(a["bar_levels"])
    palette = choose_palette(prof, brief, rng)

    layers = []
    for iid in palette:
        regions = []
        for start, end in _spans_for(iid, sections, a["bars"]):
            pattern, why = _pattern(iid, a, start, end, rng, prof)
            regions.append({"start_bar": start, "end_bar": end, "why": why, "pattern": pattern})
        params = dict(prof.get("params", {}).get(iid, {}))
        if iid == "hihat_closed" and "tone" not in params:
            params["tone"] = 0.4 if a["brightness_hz"] > 3500 else 0.7
        layers.append({"instrument": iid, "reason": CATALOG[iid]["blurb"].capitalize() + ".", "params": params, "regions": regions})

    feel = ("slow" if a["bpm"] < 95 else "fast" if a["bpm"] >= 135 else "mid-tempo") + (
        ", dark" if a["brightness_hz"] < 2500 else ", bright") + f", {a['mode']}"
    plan = {
        "genre": gid,
        "swing": prof["swing"],
        "summary": f"Rule-based {prof['name']} beat for a {feel} vocal at {a['bpm']} BPM in {a['key']}.",
        "reply": f"I built a {prof['name']} beat with {', '.join(CATALOG[i]['name'] for i in palette)}. "
                 "This came from my built-in rules, not the AI model.",
        "layers": layers,
    }
    return sanitize_plan(plan, a, gid)
