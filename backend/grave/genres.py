"""Genre profiles: how each style is usually produced.

Used three ways:
- the AI producer gets the requested genre's profile as guidance,
- the rule-based fallback builds its palette and drum patterns from it,
- the beat tempo is folded to half or double the vocal tempo when that lands in
  the genre's usual range (the vocal is never time-stretched, so only x2 / x0.5
  keep the beat in sync with the voice).
"""
import re

AUTO = "auto"

GENRES = {
    "horror_trap": {
        "name": "Horror Trap", "bpm": (130, 160), "swing": 0.0,
        "keywords": r"horror ?trap|dark trap|horrorcore|halloween|spooky|haunted|creepy|scary|\bevil\b",
        "guide": ("Half-time trap with a horror edge: snare or clap only on step 8 (beat 3), 808 on step 0 plus syncopated "
                  "16ths with long tails, 16th hats with rolls in fill_steps. Minor key, dissonant bells, music box, choir "
                  "and drones; sparse eerie intro, everything in the hook."),
        "core": ["808_distorted", "hihat_closed", "snare_trap"],
        "options": [["music_box", "church_bell", "piano"], ["ghost_choir", "horror_strings", "haunted_organ"], ["horror_drone", "noise_riser"]],
        "patterns": {
            "snare_trap": {"steps": [8]},
            "hihat_closed": {"steps": list(range(0, 16, 2)), "fill_steps": [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]},
        },
        "chords": {"minor": [0, 5, 2, 6], "major": [0, 5, 3, 4]},
    },
    "trap": {
        "name": "Trap / Rap", "bpm": (130, 160), "swing": 0.0,
        "keywords": r"\btrap\b|\brap\b|hip ?hop|rapper",
        "guide": ("Modern trap: half-time, clap or snare on step 8 only, 808 on step 0 and syncopated 16ths (glide between "
                  "notes), rapid 8th or 16th hats with rolls in fill_steps, an open hat late in the bar. A simple catchy loop "
                  "(pluck, piano or bells) over 1-2 chords, hard-hitting hook."),
        "core": ["808_sub", "hihat_closed", "clap"],
        "options": [["dark_pluck", "piano", "glockenspiel"], ["dark_pad", "warm_pad"], ["hihat_open"]],
        "patterns": {
            "clap": {"steps": [8]},
            "hihat_closed": {"steps": list(range(0, 16, 2)), "fill_steps": [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]},
            "hihat_open": {"steps": [14]},
        },
        "chords": {"minor": [0, 5, 2, 6], "major": [0, 5, 3, 4]},
    },
    "drill": {
        "name": "Drill", "bpm": (138, 146), "swing": 0.0,
        "keywords": r"\bdrill\b",
        "guide": ("UK/NY drill: half-time, snare on step 8 with extra late snares (e.g. 14) in fills, sliding 808s that glide "
                  "between DIFFERENT degrees every hit, bouncy triplet-feel hats [0,3,6,8,11,14], sparse syncopated kick. "
                  "Dark minor piano, strings or choir melodies."),
        "core": ["808_glide", "hihat_closed", "snare_trap"],
        "options": [["piano", "horror_strings", "dark_pluck"], ["ghost_choir", "dark_pad"]],
        "patterns": {
            "snare_trap": {"steps": [8], "fill_steps": [8, 14]},
            "hihat_closed": {"steps": [0, 3, 6, 8, 11, 14]},
            "808_glide": {"steps": [0, 6, 10], "degrees": [0, 3, -2]},
        },
        "chords": {"minor": [0, 5, 6, 4], "major": [0, 5, 3, 4]},
    },
    "boom_bap": {
        "name": "Boom Bap", "bpm": (82, 98), "swing": 0.55,
        "keywords": r"boom ?bap|old ?school|\b90s\b|golden age|east coast|jazzy rap",
        "guide": ("90s hip hop: hard kick on 0 and 10 (or 7), fat snare on 4 and 12 (beats 2 and 4), swung 8th hats "
                  "(swing about 0.55). Jazzy sampled feel: electric piano or piano chords, deep bass following the kick, "
                  "vinyl dust. Loop-based with few changes, leaving space for the rapper."),
        "core": ["kick_boom", "snare_boom", "hihat_closed"],
        "options": [["rhodes", "piano"], ["synth_bass", "808_sub"], ["vinyl_crackle"]],
        "patterns": {
            "kick_boom": {"steps": [0, 7, 10]},
            "snare_boom": {"steps": [4, 12]},
            "hihat_closed": {"steps": list(range(0, 16, 2))},
        },
        "params": {"hihat_closed": {"tone": 0.45}},
        "chords": {"minor": [0, 3, 5, 4], "major": [1, 4, 0, 5]},
    },
    "lofi": {
        "name": "Lo-fi", "bpm": (70, 90), "swing": 0.5,
        "keywords": r"lo-?fi|chill ?hop|study beats?|\bchill\b",
        "guide": ("Lo-fi hip hop: dusty kick, soft snare on 4 and 12, lazy swung hats (swing about 0.5), mellow jazzy "
                  "electric piano chords (7ths), vinyl crackle, soft guitar or bell melodies, everything dark-toned "
                  "(low tone values). Calm, cozy, repetitive."),
        "core": ["kick_boom", "snare_boom", "rhodes", "vinyl_crackle"],
        "options": [["guitar", "glockenspiel", "piano"], ["warm_pad"], ["hihat_closed", "shaker"]],
        "patterns": {
            "kick_boom": {"steps": [0, 10]},
            "snare_boom": {"steps": [4, 12]},
            "hihat_closed": {"steps": list(range(0, 16, 2))},
        },
        "params": {"snare_boom": {"tone": 0.2}, "hihat_closed": {"tone": 0.3}, "rhodes": {"tone": 0.35}, "kick_boom": {"tone": 0.2}},
        "chords": {"minor": [0, 5, 3, 4], "major": [3, 2, 1, 0]},
    },
    "rnb": {
        "name": "R&B", "bpm": (60, 95), "swing": 0.25,
        "keywords": r"r ?& ?b|\brnb\b|r and b|\bsoul\b|neo-?soul|slow jam|\bsmooth\b",
        "guide": ("Smooth R&B: laid-back kick, rim or soft snare on 4 and 12, light 16th hats or shaker with slight swing "
                  "(about 0.25), warm electric piano chords with extended harmony, round bass, pads and guitar licks "
                  "answering the vocal. Spacious and sensual, never aggressive."),
        "core": ["kick_punch", "rimshot", "rhodes"],
        "options": [["synth_bass", "808_sub"], ["warm_pad", "guitar"], ["shaker", "hihat_closed"]],
        "patterns": {
            "kick_punch": {"steps": [0, 7, 10]},
            "rimshot": {"steps": [4, 12]},
            "hihat_closed": {"steps": list(range(16))},
        },
        "params": {"hihat_closed": {"tone": 0.4}},
        "chords": {"minor": [0, 3, 6, 5], "major": [1, 4, 0, 3]},
    },
    "pop": {
        "name": "Pop", "bpm": (95, 128), "swing": 0.0,
        "keywords": r"\bpop\b|radio|catchy|mainstream",
        "guide": ("Radio pop: steady kick on 0 and 8 (+ pickups), clap on 4 and 12, bright 8th hats or shaker, punchy synth "
                  "bass locked to the kick, a catchy bright pluck, piano or guitar hook answering the vocal, big chords "
                  "(supersaw or pad) in the chorus. Clear build: sparse verse, riser, full chorus. Bright, no horror."),
        "core": ["kick_punch", "clap", "synth_bass"],
        "options": [["pop_pluck", "piano", "guitar"], ["supersaw", "warm_pad"], ["hihat_closed", "shaker"], ["noise_riser"]],
        "patterns": {
            "kick_punch": {"steps": [0, 8, 10]},
            "clap": {"steps": [4, 12]},
            "hihat_closed": {"steps": list(range(0, 16, 2))},
        },
        "params": {"hihat_closed": {"tone": 0.75}},
        "chords": {"minor": [0, 5, 2, 6], "major": [0, 4, 5, 3]},
    },
    "house": {
        "name": "House / EDM", "bpm": (118, 128), "swing": 0.1,
        "keywords": r"\bhouse\b|\bedm\b|\bdance\b|\bclub\b|techno|four on the floor",
        "guide": ("House/EDM: four-on-the-floor kick on 0,4,8,12, clap on 4 and 12, open hats on the off-beats (2,6,10,14), "
                  "off-beat synth bass, piano or supersaw chord stabs. Builds and drops: strip drums in breaks, riser, "
                  "impact into the drop."),
        "core": ["kick_four", "clap", "hihat_open", "synth_bass"],
        "options": [["supersaw", "warm_pad"], ["pop_pluck", "piano"], ["shaker", "hihat_closed"], ["noise_riser"]],
        "patterns": {
            "kick_four": {"steps": [0, 4, 8, 12]},
            "clap": {"steps": [4, 12]},
            "hihat_open": {"steps": [2, 6, 10, 14]},
            "synth_bass": {"steps": [2, 6, 10, 14]},
            "shaker": {"steps": list(range(16))},
            "hihat_closed": {"steps": list(range(16))},
        },
        "chords": {"minor": [0, 5, 3, 4], "major": [5, 3, 0, 4]},
    },
    "afrobeats": {
        "name": "Afrobeats", "bpm": (95, 115), "swing": 0.15,
        "keywords": r"afro|amapiano|naija",
        "guide": ("Afrobeats: mid-tempo bounce, syncopated kick, 3-3-2 rim or clave on 0,3,6,10,12, busy shaker, congas "
                  "talking around the groove, clean plucked guitar riffs, warm chords, melodic bass. Bright, joyful, "
                  "usually major."),
        "core": ["kick_punch", "rimshot", "shaker", "conga"],
        "options": [["guitar", "pop_pluck"], ["synth_bass", "808_sub"], ["warm_pad", "rhodes"]],
        "patterns": {
            "kick_punch": {"steps": [0, 6, 8, 14]},
            "rimshot": {"steps": [0, 3, 6, 10, 12]},
            "shaker": {"steps": [0, 2, 3, 4, 6, 8, 10, 11, 12, 14]},
            "conga": {"steps": [2, 5, 8, 11, 14], "degrees": [0, 2, 0, 4, 2]},
        },
        "chords": {"minor": [0, 5, 6, 4], "major": [0, 4, 5, 3]},
    },
    "reggaeton": {
        "name": "Reggaeton", "bpm": (88, 100), "swing": 0.0,
        "keywords": r"reggaet|dembow|\blatin\b|perreo",
        "guide": ("Reggaeton: dembow rhythm, kick on every beat (0,4,8,12) and snare on 3,6,11,14, steady 8th hats, "
                  "bouncing synth bass, catchy plucks or guitar, minor-key latin chords."),
        "core": ["kick_four", "snare_trap", "hihat_closed", "synth_bass"],
        "options": [["pop_pluck", "guitar", "piano"], ["warm_pad", "supersaw"], ["conga"]],
        "patterns": {
            "kick_four": {"steps": [0, 4, 8, 12]},
            "snare_trap": {"steps": [3, 6, 11, 14]},
            "hihat_closed": {"steps": list(range(0, 16, 2))},
            "synth_bass": {"steps": [0, 3, 8, 11]},
        },
        "chords": {"minor": [0, 5, 6, 4], "major": [5, 3, 0, 4]},
    },
    "cinematic": {
        "name": "Cinematic Horror", "bpm": (60, 110), "swing": 0.0,
        "keywords": r"cinematic|\bfilm\b|movie|trailer|orchestra|soundtrack|\bscore\b",
        "guide": ("Horror film score: no hats or trap drums. War toms and boom impacts on big moments, tense string swells, "
                  "choir or organ, tolling bells, drones and risers. Build tension slowly, hit hard at the hook."),
        "core": ["toms", "horror_strings", "impact", "noise_riser"],
        "options": [["ghost_choir", "haunted_organ"], ["church_bell", "piano", "music_box"], ["horror_drone", "reese_bass"]],
        "patterns": {
            "toms": {"steps": [0, 3, 6, 10], "degrees": [0, -2, -3, 0]},
            "impact": {"steps": [0]},
        },
        "chords": {"minor": [0, 5, 1, 4], "major": [0, 3, 5, 4]},
    },
}

# Most specific first, so "horror trap" wins over "trap" and "old school rap" over "rap".
DETECT_ORDER = ["drill", "horror_trap", "cinematic", "boom_bap", "lofi", "rnb", "afrobeats", "reggaeton", "house", "pop", "trap"]
DISPLAY_ORDER = ["horror_trap", "trap", "drill", "boom_bap", "lofi", "rnb", "pop", "house", "afrobeats", "reggaeton", "cinematic"]
DARK = {"horror_trap", "trap", "drill", "cinematic", "boom_bap"}
SWITCH_INTENT = re.compile(
    r"\b(genre|style|make it|turn it|turn this|switch|convert|change it|change to|remake|redo|remix|flip|version|"
    r"as an?|into an?|instead)\b",
    re.IGNORECASE,
)


def valid(gid) -> bool:
    return isinstance(gid, str) and gid in GENRES


def detect(text: str) -> str | None:
    """Genre named in free text ("old school boom bap", "make it pop"), or None."""
    t = (text or "").lower()
    for gid in DETECT_ORDER:
        if re.search(GENRES[gid]["keywords"], t):
            return gid
    return None


def detect_switch(message: str) -> str | None:
    """Genre a chat message asks to switch to. Needs intent, so "add a trap snare" does not count."""
    return detect(message) if SWITCH_INTENT.search(message or "") else None


def guess(analysis: dict) -> str:
    """Best genre for a vocal when the user did not choose one."""
    bpm = analysis["bpm"]
    moody = analysis["mode"] == "minor" and analysis["brightness_hz"] < 2600
    best, best_score = "horror_trap", float("-inf")
    for gid in DETECT_ORDER:
        lo, hi = GENRES[gid]["bpm"]
        if lo <= bpm <= hi:
            score = 2.0
        elif any(lo <= bpm * f <= hi for f in (2, 0.5)):
            score = 1.0
        else:
            continue
        score += 1.0 if (gid in DARK) == moody else -1.0
        if gid == "horror_trap" and moody:
            score += 0.5  # gRave's Kiroween default for dark vocals
        if score > best_score:
            best, best_score = gid, score
    return best


def resolve(genre: str, brief: str, analysis: dict) -> str:
    if valid(genre):
        return genre
    return detect(brief) or guess(analysis)


def fit_tempo(gid: str, bpm: int) -> int:
    """Half or double the tempo if that lands in the genre's usual range; else keep it."""
    lo, hi = GENRES[gid]["bpm"]
    if lo <= bpm <= hi:
        return bpm
    for factor in (2, 0.5):
        if lo <= bpm * factor <= hi:
            return int(round(bpm * factor))
    return bpm


def _instruments(g: dict) -> list[str]:
    seen = []
    for iid in [*g["core"], *[i for opts in g["options"] for i in opts]]:
        if iid not in seen:
            seen.append(iid)
    return seen


def genre_block(gid: str, bpm: int | None = None) -> str:
    """Full profile of one genre, for the LLM."""
    g = GENRES[gid]
    lo, hi = g["bpm"]
    text = (
        f"GENRE PROFILE: {g['name']} (id {gid}). Usual tempo {lo}-{hi} BPM, swing about {g['swing']}.\n"
        f"{g['guide']}\nTypical instruments: {', '.join(_instruments(g))}.\n"
        f"Typical chord roots per 2 bars: minor {g['chords']['minor']}, major {g['chords']['major']}."
    )
    if bpm and not lo <= bpm <= hi:
        text += (f"\nThe beat is locked to the vocal at {bpm} BPM, outside the usual range: keep that tempo and use a "
                 "half-time or double-time feel instead.")
    return text


def instruments_of(gid: str) -> list[str]:
    return _instruments(GENRES[gid])


def genres_prompt() -> str:
    """Compact genre list for the LLM's system prompt (the chosen genre's full profile goes in the request)."""
    return "; ".join(f"{gid} ({GENRES[gid]['name']}, {GENRES[gid]['bpm'][0]}-{GENRES[gid]['bpm'][1]})" for gid in DISPLAY_ORDER)


def genre_spec() -> list[dict]:
    """Genre list for the frontend picker and MCP clients."""
    return [{"id": AUTO, "name": "Auto (producer decides)", "bpm": None, "guide": ""}] + [
        {"id": gid, "name": GENRES[gid]["name"], "bpm": list(GENRES[gid]["bpm"]), "guide": GENRES[gid]["guide"]}
        for gid in DISPLAY_ORDER
    ]
