"""Custom instruments: synth patches designed by the AI, played by the frontend's patch synth.

A patch is a small sound recipe (oscillators/noise, pitch envelope, FM, filter,
amp envelope, LFO, drive, bitcrush, echo). Anything the model writes goes
through `sanitize_patch`, so every value is in a safe, playable range.
"""
import colorsys
import hashlib
import math
import re

SOURCE_TYPES = ["sine", "square", "sawtooth", "triangle", "noise"]
FILTER_TYPES = ["lowpass", "highpass", "bandpass", "notch"]
LFO_TARGETS = ["none", "pitch", "filter", "amp"]
KINDS = ["hits", "melodic", "chords", "sustained"]
ROLES = ["bass", "drums", "melody", "chords", "texture", "fx"]
MAX_SOURCES = 4
MAX_CUSTOM = 3  # custom instruments per plan (keeps Groq prompts small)

# (section, field): (default, min, max). Section "" = top level.
LIMITS = {
    ("", "octave"): (0, -3, 3),
    ("pitch_env", "amount"): (0.0, 0.0, 4.0),
    ("pitch_env", "time"): (0.05, 0.001, 1.0),
    ("fm", "ratio"): (2.0, 0.25, 16.0),
    ("fm", "depth"): (0.0, 0.0, 10.0),
    ("filter", "cutoff"): (4000.0, 40.0, 18000.0),
    ("filter", "resonance"): (0.7, 0.1, 20.0),
    ("filter", "env_amount"): (0.0, -1.0, 1.0),
    ("filter", "env_time"): (0.2, 0.005, 4.0),
    ("amp_env", "attack"): (0.005, 0.001, 4.0),
    ("amp_env", "decay"): (0.4, 0.01, 8.0),
    ("amp_env", "sustain"): (0.6, 0.0, 1.0),
    ("amp_env", "release"): (0.3, 0.01, 6.0),
    ("lfo", "rate"): (5.0, 0.05, 20.0),
    ("lfo", "depth"): (0.0, 0.0, 1.0),
    ("", "drive"): (0.0, 0.0, 1.0),
    ("", "bitcrush"): (0.0, 0.0, 1.0),
    ("echo", "mix"): (0.0, 0.0, 0.8),
    ("echo", "time"): (0.25, 0.03, 1.2),
    ("echo", "feedback"): (0.3, 0.0, 0.85),
}
CHOICES = {("filter", "type"): FILTER_TYPES, ("lfo", "target"): LFO_TARGETS}
SOURCE_LIMITS = {"ratio": (1.0, 0.25, 16.0), "detune": (0.0, -50.0, 50.0), "level": (0.7, 0.0, 1.0)}
INT_FIELDS = {("", "octave")}
LOG_FIELDS = {("filter", "cutoff")}
DEFAULT_STEPS = {"hits": [0, 8], "melodic": [0, 6, 10], "chords": [], "sustained": []}

LABELS = {
    "octave": "Octave", "pitch_env.amount": "Pitch drop amount", "pitch_env.time": "Pitch drop time",
    "fm.ratio": "FM ratio", "fm.depth": "FM depth (metallic)", "filter.type": "Filter type",
    "filter.cutoff": "Filter cutoff (Hz)", "filter.resonance": "Resonance", "filter.env_amount": "Filter sweep",
    "filter.env_time": "Filter sweep time", "amp_env.attack": "Attack", "amp_env.decay": "Decay",
    "amp_env.sustain": "Sustain", "amp_env.release": "Release", "lfo.target": "LFO target",
    "lfo.rate": "LFO rate (Hz)", "lfo.depth": "LFO depth", "drive": "Drive", "bitcrush": "Bitcrush",
    "echo.mix": "Echo mix", "echo.time": "Echo time", "echo.feedback": "Echo feedback",
}


def _num(v, lo, hi, default):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    if math.isnan(x) or math.isinf(x):
        return default
    return min(hi, max(lo, x))


def _section(raw: dict, name: str) -> dict:
    if not name:
        return raw
    sec = raw.get(name)
    return sec if isinstance(sec, dict) else {}


def sanitize_patch(raw) -> dict:
    """Return a complete, in-range patch. Never raises: bad fields fall back to defaults."""
    raw = raw if isinstance(raw, dict) else {}
    name = raw.get("name") if isinstance(raw.get("name"), str) else ""
    name = re.sub(r"\s+", " ", name).strip()[:40] or "Custom Instrument"
    patch: dict = {"name": name}

    sources = []
    for s in (raw.get("sources") if isinstance(raw.get("sources"), list) else [])[:MAX_SOURCES]:
        if not isinstance(s, dict) or s.get("type") not in SOURCE_TYPES:
            continue
        clean = {"type": s["type"]}
        for key, (default, lo, hi) in SOURCE_LIMITS.items():
            clean[key] = round(_num(s.get(key), lo, hi, default), 3)
        sources.append(clean)
    if not any(s["level"] > 0 for s in sources):
        sources = [{"type": "sawtooth", "ratio": 1.0, "detune": 0.0, "level": 0.7}]
    patch["sources"] = sources

    for (sec, key), (default, lo, hi) in LIMITS.items():
        v = _num(_section(raw, sec).get(key), lo, hi, default)
        v = int(round(v)) if (sec, key) in INT_FIELDS else round(v, 4)
        if sec:
            patch.setdefault(sec, {})[key] = v
        else:
            patch[key] = v
    for (sec, key), options in CHOICES.items():
        v = _section(raw, sec).get(key)
        patch.setdefault(sec, {})[key] = v if v in options else options[0]
    return patch


def patch_color(name: str) -> str:
    """Stable, readable color per custom instrument name."""
    hue = int(hashlib.md5(name.encode("utf-8")).hexdigest()[:6], 16) / 0xFFFFFF
    r, g, b = colorsys.hls_to_rgb(hue, 0.65, 0.85)
    return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(b * 255))


def custom_id(raw_id, name: str, taken: set[str]) -> str:
    if isinstance(raw_id, str) and re.fullmatch(r"custom_[a-z0-9_]{1,40}", raw_id) and raw_id not in taken:
        return raw_id
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:24] or "sound"
    base = f"custom_{slug}"
    if base not in taken:
        return base
    n = 2
    while f"{base}_{n}" in taken:
        n += 1
    return f"{base}_{n}"


def _range(sec: str, key: str) -> str:
    _, lo, hi = LIMITS[(sec, key)]
    return f"{lo}..{hi}"


def patch_prompt(full: bool = True) -> str:
    """How to design a custom instrument, for the LLM. Ranges come from LIMITS.

    The compact form (about a quarter of the size) is used when the user is not asking
    for a new sound; values outside the ranges are clamped by sanitize_patch anyway.
    """
    if not full:
        return (
            f"CUSTOM INSTRUMENTS (optional, max {MAX_CUSTOM}): a layer {{\"instrument\":\"custom\",\"kind\",\"role\",\"patch\":"
            f"{{\"name\",\"sources\":[{{\"type\":{'|'.join(SOURCE_TYPES)},\"ratio\",\"detune\",\"level\"}}],\"octave\":-3..3,"
            "\"pitch_env\":{\"amount\",\"time\"},\"fm\":{\"ratio\",\"depth\"},\"filter\":{\"type\":"
            f"{'|'.join(FILTER_TYPES)},\"cutoff\",\"resonance\",\"env_amount\",\"env_time\"}},"
            "\"amp_env\":{\"attack\",\"decay\",\"sustain\",\"release\"},\"lfo\":{\"target\":"
            f"{'|'.join(LFO_TARGETS)},\"rate\",\"depth\"}},\"drive\",\"bitcrush\",\"echo\":{{\"mix\",\"time\",\"feedback\"}}}}}}. "
            "Values outside safe ranges are clamped."
        )
    r = _range
    s = SOURCE_LIMITS
    return f"""CUSTOM INSTRUMENTS (design your own sound; max {MAX_CUSTOM} per plan)
Use one when the brief asks for a sound the catalog lacks ("chainsaw 808", "whispering bell"), or to give the track a
signature sound. Layer form:
{{"instrument": "custom", "id": "optional, keep it when revising", "kind": "hits|melodic|chords|sustained",
 "role": "bass|drums|melody|chords|texture|fx", "volume": 0.05-1.2, "reason": "...", "regions": [...],
 "patch": {{
   "name": "short evocative name",
   "sources": [up to {MAX_SOURCES} {{"type": "{'|'.join(SOURCE_TYPES)}", "ratio": {s['ratio'][1]}..{s['ratio'][2]} (multiple of the note frequency),
               "detune": {s['detune'][1]}..{s['detune'][2]} cents, "level": 0..1}}],
   "octave": {r('', 'octave')} (0 = middle register, -2 = bass),
   "pitch_env": {{"amount": {r('pitch_env', 'amount')} (note starts this many times higher then drops: kicks, zaps), "time": {r('pitch_env', 'time')}}},
   "fm": {{"ratio": {r('fm', 'ratio')}, "depth": {r('fm', 'depth')} (metallic, bell, growl; non-integer ratios sound clangy)}},
   "filter": {{"type": "{'|'.join(FILTER_TYPES)}", "cutoff": {r('filter', 'cutoff')} Hz, "resonance": {r('filter', 'resonance')},
              "env_amount": {r('filter', 'env_amount')} (cutoff sweep at note start), "env_time": {r('filter', 'env_time')}}},
   "amp_env": {{"attack": {r('amp_env', 'attack')}, "decay": {r('amp_env', 'decay')}, "sustain": 0..1, "release": {r('amp_env', 'release')}}},
   "lfo": {{"target": "{'|'.join(LFO_TARGETS)}", "rate": {r('lfo', 'rate')} Hz, "depth": 0..1}},
   "drive": 0..1, "bitcrush": 0..1 (lo-fi grit),
   "echo": {{"mix": {r('echo', 'mix')}, "time": {r('echo', 'time')} s, "feedback": {r('echo', 'feedback')}}}
 }}}}
"kind" decides how its pattern works (see PATTERN BY KIND); hits play one pitch and ignore sustain.
Recipes: kick = sine, pitch_env amount 3 time 0.06, decay 0.3, sustain 0. Snare or hat = noise through highpass or
bandpass, decay 0.05-0.2. Bell = sine + fm ratio 3.5 depth 3, decay 2, sustain 0. Growl bass = sawtooth, octave -2,
lowpass 300 resonance 8, lfo filter. Ghost voice = sine + triangle detuned, attack 1, lfo pitch depth 0.3, echo 0.4."""


def patch_spec() -> dict:
    """Editable patch knobs for the frontend Inspector."""
    knobs = []
    for (sec, key), (default, lo, hi) in LIMITS.items():
        path = f"{sec}.{key}" if sec else key
        knobs.append({
            "path": path, "label": LABELS.get(path, path), "type": "number", "default": default,
            "min": lo, "max": hi, "int": (sec, key) in INT_FIELDS, "log": (sec, key) in LOG_FIELDS,
        })
    for (sec, key), options in CHOICES.items():
        path = f"{sec}.{key}"
        knobs.append({"path": path, "label": LABELS.get(path, path), "type": "choice", "default": options[0], "choices": options})
    return {
        "knobs": knobs,
        "source_types": SOURCE_TYPES,
        "source_limits": {k: {"default": d, "min": lo, "max": hi} for k, (d, lo, hi) in SOURCE_LIMITS.items()},
        "max_sources": MAX_SOURCES,
    }
