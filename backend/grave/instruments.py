"""Instrument catalog: everything the AI producer can choose from.

The producer (LLM or rules) picks a palette from this catalog for each vocal.
The frontend renders each instrument with the synth `engine` named here.

Kinds (how a region's pattern is read):
  hits      - pattern.steps (+ optional fill_steps). Drums, percussion, impacts.
  melodic   - pattern.steps + pattern.degrees (scale degree per step) + fill_steps.
  chords    - pattern.degrees = chord root degree for each 2 bars, cycling.
  sustained - plays through the whole region, no pattern.

Params: {name: (default, min, max)} for numbers, {name: [default, *choices]} for choices.
"""

INT_PARAMS = {"tune", "octave"}
WAVES = ["sawtooth", "square", "triangle", "sine"]

CATALOG = {
    # ---- bass ---------------------------------------------------------------
    "808_sub": {
        "name": "808 Sub", "role": "bass", "engine": "sub808", "kind": "melodic", "color": "#ff2e4d", "volume": 0.85,
        "params": {"decay": (0.8, 0.25, 1.6), "glide": (0.3, 0.0, 1.0), "drive": (0.15, 0.0, 1.0), "tune": (0, -12, 12)},
        "steps": [0, 7, 10, 14],
        "blurb": "clean, deep 808 sub with a long tail; classic trap low end",
    },
    "808_distorted": {
        "name": "Distorted 808", "role": "bass", "engine": "sub808", "kind": "melodic", "color": "#ff4d6d", "volume": 0.8,
        "params": {"decay": (0.7, 0.25, 1.6), "glide": (0.4, 0.0, 1.0), "drive": (0.8, 0.0, 1.0), "tune": (0, -12, 12)},
        "steps": [0, 3, 7, 10, 14],
        "blurb": "saturated, growling 808 that snarls and cuts through; aggressive",
    },
    "808_glide": {
        "name": "Gliding 808", "role": "bass", "engine": "sub808", "kind": "melodic", "color": "#e0115f", "volume": 0.85,
        "params": {"decay": (1.2, 0.25, 1.6), "glide": (0.9, 0.0, 1.0), "drive": (0.35, 0.0, 1.0), "tune": (0, -12, 12)},
        "steps": [0, 6, 10],
        "blurb": "long drill-style 808 that swoops into every note; vary degrees for slides",
    },
    "reese_bass": {
        "name": "Reese Bass", "role": "bass", "engine": "reese", "kind": "melodic", "color": "#c2185b", "volume": 0.55,
        "params": {"octave": (0, -1, 1), "tone": (0.35, 0.0, 1.0), "detune": (22.0, 5.0, 50.0)},
        "steps": [0, 8],
        "blurb": "detuned, phasing, sinister mid-bass (drum and bass / horror score)",
    },
    "synth_bass": {
        "name": "Synth Bass", "role": "bass", "engine": "synthbass", "kind": "melodic", "color": "#f06292", "volume": 0.6,
        "params": {"wave": ["sawtooth", *WAVES], "octave": (0, -1, 1), "tone": (0.4, 0.0, 1.0)},
        "steps": [0, 6, 8, 14],
        "blurb": "punchy filtered synth bass; pop, house, R&B, afrobeats, reggaeton",
    },
    # ---- drums --------------------------------------------------------------
    "kick_boom": {
        "name": "Boom Bap Kick", "role": "drums", "engine": "kick", "kind": "hits", "color": "#ff6e40", "volume": 0.75,
        "params": {"tone": (0.3, 0.0, 1.0), "decay": (0.45, 0.1, 0.8)},
        "steps": [0, 7, 10],
        "blurb": "fat, dusty sampled-style kick; boom bap and lo-fi",
    },
    "kick_four": {
        "name": "Dance Kick", "role": "drums", "engine": "kick", "kind": "hits", "color": "#ff5722", "volume": 0.75,
        "params": {"tone": (0.65, 0.0, 1.0), "decay": (0.3, 0.1, 0.8)},
        "steps": [0, 4, 8, 12],
        "blurb": "tight kick for four-on-the-floor; house, EDM, pop, reggaeton",
    },
    "snare_boom": {
        "name": "Boom Bap Snare", "role": "drums", "engine": "snare", "kind": "hits", "color": "#ffb300", "volume": 0.55,
        "params": {"tone": (0.35, 0.0, 1.0), "decay": (0.25, 0.08, 0.4)},
        "steps": [4, 12],
        "blurb": "fat, crunchy backbeat snare on 4 and 12; boom bap and lo-fi",
    },
    "conga": {
        "name": "Congas", "role": "drums", "engine": "conga", "kind": "melodic", "color": "#ffab91", "volume": 0.45,
        "params": {"tune": (0, -12, 12), "decay": (0.25, 0.08, 0.6), "tone": (0.5, 0.0, 1.0)},
        "steps": [2, 5, 8, 11, 14],
        "blurb": "hand percussion; degrees pick high or low drums; afrobeats, reggaeton, latin",
    },
    "kick_punch": {
        "name": "Punch Kick", "role": "drums", "engine": "kick", "kind": "hits", "color": "#ff7043", "volume": 0.7,
        "params": {"tone": (0.5, 0.0, 1.0), "decay": (0.35, 0.1, 0.8)},
        "steps": [0, 10],
        "blurb": "short punchy kick to layer with the 808 or to drive a section without one",
    },
    "hihat_closed": {
        "name": "Closed Hi-Hats", "role": "drums", "engine": "hat", "kind": "hits", "color": "#7CFF6B", "volume": 0.45,
        "params": {"tone": (0.6, 0.0, 1.0), "decay": (0.05, 0.02, 0.15)},
        "steps": [0, 2, 4, 6, 8, 10, 12, 14],
        "blurb": "tight closed hats; all 16 steps = busy trap hats; fill_steps for rolls",
    },
    "hihat_open": {
        "name": "Open Hat", "role": "drums", "engine": "hat", "kind": "hits", "color": "#a5ff8f", "volume": 0.35,
        "params": {"tone": (0.5, 0.0, 1.0), "decay": (0.35, 0.15, 0.8)},
        "steps": [6, 14],
        "blurb": "sizzling open hat; use sparingly on off-beats",
    },
    "shaker": {
        "name": "Shaker", "role": "drums", "engine": "shaker", "kind": "hits", "color": "#c5e1a5", "volume": 0.35,
        "params": {"tone": (0.5, 0.0, 1.0)},
        "steps": [2, 6, 10, 14],
        "blurb": "soft rhythmic shaker; lighter, more organic than hats",
    },
    "clap": {
        "name": "Clap", "role": "drums", "engine": "clap", "kind": "hits", "color": "#ffd23f", "volume": 0.5,
        "params": {"tone": (0.5, 0.0, 1.0)},
        "steps": [4, 12],
        "blurb": "layered clap; backbeat on steps 4 and 12",
    },
    "snare_trap": {
        "name": "Trap Snare", "role": "drums", "engine": "snare", "kind": "hits", "color": "#ffca28", "volume": 0.5,
        "params": {"tone": (0.55, 0.0, 1.0), "decay": (0.18, 0.08, 0.4)},
        "steps": [4, 12],
        "blurb": "crisp trap snare; half-time feel on step 8 only",
    },
    "rimshot": {
        "name": "Rimshot", "role": "drums", "engine": "rim", "kind": "hits", "color": "#fff176", "volume": 0.4,
        "params": {"tone": (0.6, 0.0, 1.0)},
        "steps": [3, 11],
        "blurb": "dry woody click; sparse, ghostly percussion",
    },
    "toms": {
        "name": "War Toms", "role": "drums", "engine": "tom", "kind": "melodic", "color": "#ff8a65", "volume": 0.55,
        "params": {"decay": (0.5, 0.2, 1.2), "tune": (0, -12, 12)},
        "steps": [0, 3, 6, 10],
        "blurb": "deep war drums; degrees pick the drum pitch; great for horror builds",
    },
    # ---- melody -------------------------------------------------------------
    "synth_lead": {
        "name": "Synth Lead", "role": "melody", "engine": "lead", "kind": "melodic", "color": "#b46bff", "volume": 0.4,
        "params": {"wave": ["sawtooth", *WAVES], "octave": (0, -1, 2), "tone": (0.5, 0.0, 1.0), "release": (0.25, 0.05, 1.5)},
        "steps": [0, 6, 10],
        "blurb": "detuned synth lead melody",
    },
    "dark_pluck": {
        "name": "Dark Pluck", "role": "melody", "engine": "pluck", "kind": "melodic", "color": "#9c6bff", "volume": 0.4,
        "params": {"wave": ["square", *WAVES], "octave": (0, -1, 2), "tone": (0.4, 0.0, 1.0)},
        "steps": [0, 3, 6, 10],
        "blurb": "short plucked synth; bouncy arpeggios and riffs",
    },
    "glockenspiel": {
        "name": "Glockenspiel", "role": "melody", "engine": "glock", "kind": "melodic", "color": "#5ee7ff", "volume": 0.35,
        "params": {"octave": (0, -1, 2), "tone": (0.5, 0.0, 1.0), "decay": (1.0, 0.3, 3.0)},
        "steps": [0, 4, 8, 12],
        "blurb": "icy glockenspiel bells, sparkly and cold",
    },
    "music_box": {
        "name": "Music Box", "role": "melody", "engine": "musicbox", "kind": "melodic", "color": "#80deea", "volume": 0.35,
        "params": {"octave": (1, 0, 2), "tone": (0.6, 0.0, 1.0), "decay": (1.4, 0.4, 3.0)},
        "steps": [0, 4, 8, 12],
        "blurb": "fragile wind-up music box; haunted nursery, creepy lullaby",
    },
    "church_bell": {
        "name": "Church Bell", "role": "melody", "engine": "churchbell", "kind": "melodic", "color": "#4dd0e1", "volume": 0.4,
        "params": {"octave": (-1, -2, 1), "tone": (0.4, 0.0, 1.0), "decay": (4.0, 1.5, 8.0)},
        "steps": [0],
        "blurb": "huge tolling church bell; very few notes, long gaps",
    },
    "piano": {
        "name": "Piano", "role": "melody", "engine": "piano", "kind": "melodic", "color": "#90caf9", "volume": 0.45,
        "params": {"octave": (0, -1, 1), "tone": (0.5, 0.0, 1.0), "detune": (6.0, 0.0, 40.0)},
        "steps": [0, 8],
        "blurb": "piano; clean for pop and soul, raise detune for eerie or lo-fi",
    },
    "pop_pluck": {
        "name": "Bright Pluck", "role": "melody", "engine": "pluck", "kind": "melodic", "color": "#ea80fc", "volume": 0.4,
        "params": {"wave": ["sawtooth", *WAVES], "octave": (1, -1, 2), "tone": (0.8, 0.0, 1.0)},
        "steps": [0, 3, 6, 8, 11, 14],
        "blurb": "bright, catchy synth pluck; pop and EDM hooks and arps",
    },
    "guitar": {
        "name": "Plucked Guitar", "role": "melody", "engine": "guitar", "kind": "melodic", "color": "#bcaaa4", "volume": 0.45,
        "params": {"tone": (0.5, 0.0, 1.0), "decay": (1.2, 0.3, 3.0), "octave": (0, -1, 1)},
        "steps": [0, 3, 6, 10],
        "blurb": "nylon-style plucked guitar; afrobeats, R&B, pop and lo-fi riffs",
    },
    # ---- chords -------------------------------------------------------------
    "rhodes": {
        "name": "Electric Piano", "role": "chords", "engine": "epiano", "kind": "chords", "color": "#ce93d8", "volume": 0.4,
        "params": {"tone": (0.5, 0.0, 1.0), "tremolo": (0.35, 0.0, 1.0), "octave": (0, -1, 1)},
        "blurb": "warm Rhodes-style electric piano 7th chords; R&B, lo-fi, boom bap, neo-soul",
    },
    "supersaw": {
        "name": "Supersaw Chords", "role": "chords", "engine": "supersaw", "kind": "chords", "color": "#b388ff", "volume": 0.3,
        "params": {"spread": (25.0, 5.0, 50.0), "tone": (0.6, 0.0, 1.0), "attack": (0.05, 0.01, 2.0)},
        "blurb": "huge detuned saw chords; EDM, house, big pop choruses",
    },
    "warm_pad": {
        "name": "Warm Pad", "role": "chords", "engine": "pad", "kind": "chords", "color": "#fff59d", "volume": 0.3,
        "params": {"wave": ["triangle", *WAVES], "tone": (0.55, 0.0, 1.0), "attack": (1.0, 0.05, 3.0)},
        "blurb": "soft, warm pad; R&B, lo-fi, pop ballads",
    },
    "dark_pad": {
        "name": "Dark Pad", "role": "chords", "engine": "pad", "kind": "chords", "color": "#ff8a1f", "volume": 0.3,
        "params": {"wave": ["sawtooth", *WAVES], "tone": (0.35, 0.0, 1.0), "attack": (0.6, 0.05, 3.0)},
        "blurb": "low dark synth chords for dread and glue",
    },
    "ghost_choir": {
        "name": "Ghost Choir", "role": "chords", "engine": "choir", "kind": "chords", "color": "#ffb74d", "volume": 0.35,
        "params": {"tone": (0.4, 0.0, 1.0), "attack": (1.0, 0.2, 3.0)},
        "blurb": "breathy 'ooh' choir chords; ghostly, sacred, unsettling",
    },
    "horror_strings": {
        "name": "Horror Strings", "role": "chords", "engine": "strings", "kind": "chords", "color": "#ffa726", "volume": 0.35,
        "params": {"tone": (0.45, 0.0, 1.0), "attack": (0.8, 0.05, 3.0), "vibrato": (0.4, 0.0, 1.0)},
        "blurb": "tense string section; slow swells, film-score suspense",
    },
    "haunted_organ": {
        "name": "Haunted Organ", "role": "chords", "engine": "organ", "kind": "chords", "color": "#ffcc80", "volume": 0.3,
        "params": {"octave": (0, -1, 1), "tone": (0.5, 0.0, 1.0)},
        "blurb": "gothic pipe-organ chords; cathedral, vampire, Phantom vibe",
    },
    # ---- texture / fx -------------------------------------------------------
    "horror_drone": {
        "name": "Horror Drone", "role": "texture", "engine": "drone", "kind": "sustained", "color": "#9575cd", "volume": 0.35,
        "params": {"octave": (-1, -2, 0), "tone": (0.3, 0.0, 1.0)},
        "blurb": "low evolving drone on the key root; pure dread under intros and breaks",
    },
    "vinyl_crackle": {
        "name": "Vinyl Crackle", "role": "texture", "engine": "vinyl", "kind": "sustained", "color": "#a1887f", "volume": 0.2,
        "params": {"tone": (0.4, 0.0, 1.0)},
        "blurb": "dusty record crackle; lo-fi, old tape, found-footage feel",
    },
    "noise_riser": {
        "name": "Noise Riser", "role": "fx", "engine": "riser", "kind": "sustained", "color": "#bdbdbd", "volume": 0.3,
        "params": {"tone": (0.5, 0.0, 1.0)},
        "blurb": "white-noise sweep that builds across its region; put it in the bar(s) right BEFORE a hook",
    },
    "impact": {
        "name": "Boom Impact", "role": "fx", "engine": "impact", "kind": "hits", "color": "#8d6e63", "volume": 0.5,
        "params": {"decay": (2.0, 0.5, 4.0), "tone": (0.4, 0.0, 1.0)},
        "steps": [0],
        "blurb": "huge cinematic boom; step 0 of the first bar of a big moment",
    },
}

# Old plan ids from before the catalog existed.
LEGACY_IDS = {
    "kick808": "808_sub", "hihat": "hihat_closed", "lead": "synth_lead",
    "glock": "glockenspiel", "pad": "dark_pad",
}


def param_spec(iid: str) -> dict:
    out = {}
    for key, spec in CATALOG[iid]["params"].items():
        if isinstance(spec, list):
            out[key] = {"type": "choice", "default": spec[0], "choices": spec[1:]}
        else:
            default, lo, hi = spec
            out[key] = {"type": "number", "default": default, "min": lo, "max": hi, "int": key in INT_PARAMS}
    return out


def catalog_spec() -> dict:
    """JSON-friendly catalog for the frontend and MCP clients."""
    return {
        iid: {
            "name": c["name"], "role": c["role"], "engine": c["engine"], "kind": c["kind"],
            "color": c["color"], "volume": c["volume"], "blurb": c["blurb"],
            "default_steps": c.get("steps", []), "params": param_spec(iid),
        }
        for iid, c in CATALOG.items()
    }


def catalog_prompt(detailed=None) -> str:
    """Catalog description for the LLM.

    Instruments in `detailed` (or all, when None) get a full line with params; the
    rest are listed by id only, to keep the prompt inside small token budgets.
    """
    ids = list(CATALOG) if detailed is None else [i for i in CATALOG if i in set(detailed)]
    lines = []
    for iid in ids:
        c = CATALOG[iid]
        params = []
        for key, spec in c["params"].items():
            params.append(f"{key} {'|'.join(spec[1:])}" if isinstance(spec, list) else f"{key} {spec[1]}..{spec[2]}")
        lines.append(f"- {iid} ({c['kind']}, {c['role']}): {c['blurb']}. {', '.join(params)}")
    others = [i for i in CATALOG if i not in ids]
    if others:
        lines.append("Also available (default params): " + ", ".join(f"{i} ({CATALOG[i]['kind']})" for i in others))
    return "\n".join(lines)
