"""The plan contract between the AI producer, the backend and the frontend.

Anything an LLM (or a Kiro agent) returns goes through `sanitize_plan`, so the
frontend only ever sees a safe, complete plan built from the instrument catalog.

Plan shape (bars 1-based and inclusive, steps are 16th notes 0-15):
{
  "summary": str, "reply": str,
  "layers": [{
     "instrument": catalog id, "id": stable layer id, "volume": 0.05-1.2, "reason": str,
     "params": {...},
     "regions": [{"start_bar", "end_bar", "why",
                  "pattern": {"steps": [int], "degrees": [int], "fill_steps": [int]}}]
  }]
}
"""
import math
import re

from .genres import GENRES
from .instruments import CATALOG, INT_PARAMS, LEGACY_IDS
from .patch import DEFAULT_STEPS as CUSTOM_STEPS
from .patch import KINDS, MAX_CUSTOM, ROLES, custom_id, patch_color, sanitize_patch

MAX_LAYERS = 9
MAX_SWING = 0.6
MAX_REGIONS = 8
ROLE_ORDER = ["bass", "drums", "melody", "chords", "texture", "fx"]


class PlanError(ValueError):
    """The plan could not be turned into something playable."""


def _num(v, lo, hi, default):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    if math.isnan(x) or math.isinf(x):
        return default
    return min(hi, max(lo, x))


def _int(v, lo, hi, default):
    return int(round(_num(v, lo, hi, default)))


def _text(v, limit):
    return v.strip()[:limit] if isinstance(v, str) else ""


def _pairs(steps_raw, degrees_raw, with_degrees):
    """Sorted, de-duplicated (step, degree) pairs; degrees stay aligned with steps."""
    steps_raw = steps_raw if isinstance(steps_raw, list) else []
    degrees_raw = degrees_raw if isinstance(degrees_raw, list) else []
    seen: dict[int, int] = {}
    for i, s in enumerate(steps_raw[:32]):
        try:
            step = int(s)
        except (TypeError, ValueError):
            continue
        if 0 <= step <= 15 and step not in seen:
            seen[step] = _int(degrees_raw[i], -14, 14, 0) if (with_degrees and i < len(degrees_raw)) else 0
    ordered = sorted(seen.items())
    return [s for s, _ in ordered], [d for _, d in ordered]


def default_chord_degrees(mode: str) -> list[int]:
    return [0, 5, 2, 6] if mode == "minor" else [0, 4, 5, 3]


def _pattern(raw, kind: str, default_steps: list[int], mode: str) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    if kind == "sustained":
        return {"steps": [], "degrees": [], "fill_steps": []}
    if kind == "chords":
        degs = raw.get("degrees") if isinstance(raw.get("degrees"), list) else []
        degs = [_int(d, -14, 14, 0) for d in degs[:8]] or default_chord_degrees(mode)
        return {"steps": [], "degrees": degs, "fill_steps": []}
    melodic = kind == "melodic"
    steps, degrees = _pairs(raw.get("steps"), raw.get("degrees"), melodic)
    if not steps:
        steps = list(default_steps or [0])
        degrees = [0] * len(steps)
    fill, _ = _pairs(raw.get("fill_steps"), None, False)
    return {"steps": steps, "degrees": degrees if melodic else [], "fill_steps": fill}


def _regions(raw, bars: int, kind: str, default_steps: list[int], mode: str) -> list[dict]:
    out = []
    for r in (raw if isinstance(raw, list) else [])[:MAX_REGIONS * 2]:
        if not isinstance(r, dict):
            continue
        try:
            start, end = int(r.get("start_bar")), int(r.get("end_bar"))
        except (TypeError, ValueError):
            continue
        start, end = max(1, start), min(bars, end)
        if end < start:
            continue
        out.append({
            "start_bar": start, "end_bar": end, "why": _text(r.get("why"), 160),
            "pattern": _pattern(r.get("pattern"), kind, default_steps, mode),
        })
    out.sort(key=lambda r: r["start_bar"])
    clean = []
    for r in out:  # never let two regions of one layer overlap (double hits)
        if clean and r["start_bar"] <= clean[-1]["end_bar"]:
            r["start_bar"] = clean[-1]["end_bar"] + 1
        if r["start_bar"] <= r["end_bar"]:
            clean.append(r)
    return clean[:MAX_REGIONS]


def _params(raw, iid: str) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for key, spec in CATALOG[iid]["params"].items():
        if isinstance(spec, list):
            out[key] = raw.get(key) if raw.get(key) in spec[1:] else spec[0]
        else:
            default, lo, hi = spec
            v = _num(raw.get(key), lo, hi, default)
            out[key] = int(round(v)) if key in INT_PARAMS else round(v, 3)
    return out


def _instrument_of(layer: dict) -> str | None:
    for candidate in (layer.get("instrument"), layer.get("id")):
        if not isinstance(candidate, str):
            continue
        c = candidate.strip()
        if c in CATALOG:
            return c
        if c in LEGACY_IDS:
            return LEGACY_IDS[c]
        base = re.sub(r"_\d+$", "", c)  # "piano_2" -> "piano"
        if base in CATALOG:
            return base
    return None


def _layer_id(raw_id, iid: str, taken: set[str]) -> str:
    if isinstance(raw_id, str) and re.fullmatch(rf"{re.escape(iid)}(_\d+)?", raw_id) and raw_id not in taken:
        return raw_id
    if iid not in taken:
        return iid
    n = 2
    while f"{iid}_{n}" in taken:
        n += 1
    return f"{iid}_{n}"


def _custom_layer(lr: dict, bars: int, mode: str, taken: set[str]) -> dict | None:
    """A layer whose sound is an AI-designed synth patch instead of a catalog instrument."""
    patch = sanitize_patch(lr["patch"])
    kind = lr.get("kind") if lr.get("kind") in KINDS else "melodic"
    default_role = {"hits": "drums", "chords": "chords", "sustained": "texture"}.get(kind, "melody")
    role = lr.get("role") if lr.get("role") in ROLES else default_role
    regions = _regions(lr.get("regions"), bars, kind, CUSTOM_STEPS[kind], mode)
    if not regions:
        return None
    return {
        "id": custom_id(lr.get("id"), patch["name"], taken),
        "instrument": "custom",
        "name": patch["name"],
        "role": role, "engine": "patch", "kind": kind, "color": patch_color(patch["name"]),
        "volume": round(_num(lr.get("volume"), 0.05, 1.2, 0.4), 3),
        "reason": _text(lr.get("reason"), 280),
        "params": {},
        "patch": patch,
        "regions": regions,
    }


def compute_sections(levels: list[float]) -> list[dict]:
    """Label each bar intro/verse/hook/break/outro from vocal loudness (1-based, inclusive)."""
    active = [lv > 0.12 for lv in levels]
    if True in active:
        first = active.index(True)
        last = len(active) - 1 - active[::-1].index(True)
    else:
        first = last = -1
    loud = sorted(lv for lv, a in zip(levels, active) if a)
    hook_cut = loud[int(len(loud) * 0.7)] if len(loud) >= 4 else float("inf")

    labels = []
    for i, lv in enumerate(levels):
        if first == -1:
            labels.append("verse")
        elif i < first:
            labels.append("intro")
        elif i > last:
            labels.append("outro")
        elif not active[i]:
            labels.append("break")
        else:
            labels.append("hook" if lv >= hook_cut else "verse")

    sections: list[dict] = []
    for i, name in enumerate(labels):
        if sections and sections[-1]["name"] == name:
            sections[-1]["end_bar"] = i + 1
        else:
            sections.append({"name": name, "start_bar": i + 1, "end_bar": i + 1})
    return sections


def sanitize_plan(raw, analysis: dict, default_genre: str = "horror_trap") -> dict:
    """Validate and normalize a plan against the vocal analysis and the catalog.

    `default_genre` is used when the plan names no valid genre.
    """
    if not isinstance(raw, dict):
        raise PlanError("The plan must be a JSON object.")
    layers_raw = raw.get("layers")
    if not isinstance(layers_raw, list):
        raise PlanError("The plan needs a 'layers' list.")

    bars, mode = analysis["bars"], analysis["mode"]
    layers, taken, unknown = [], set(), []
    customs = 0
    for lr in layers_raw:
        if not isinstance(lr, dict) or len(layers) >= MAX_LAYERS:
            continue
        iid = None if lr.get("instrument") == "custom" else _instrument_of(lr)
        if iid is None and isinstance(lr.get("patch"), dict):
            if customs >= MAX_CUSTOM:
                continue
            layer = _custom_layer(lr, bars, mode, taken)
            if layer:
                customs += 1
                taken.add(layer["id"])
                layers.append(layer)
            continue
        if iid is None:
            name = lr.get("instrument") or lr.get("id")
            if isinstance(name, str):
                unknown.append(name[:40])
            continue
        regions = _regions(lr.get("regions"), bars, CATALOG[iid]["kind"], CATALOG[iid].get("steps", [0]), mode)
        if not regions:
            continue
        lid = _layer_id(lr.get("id"), iid, taken)
        taken.add(lid)
        c = CATALOG[iid]
        layers.append({
            "id": lid,
            "instrument": iid,
            "name": c["name"] if lid == iid else f"{c['name']} {lid.rsplit('_', 1)[-1]}",
            "role": c["role"], "engine": c["engine"], "kind": c["kind"], "color": c["color"],
            "volume": round(_num(lr.get("volume"), 0.05, 1.2, c["volume"]), 3),
            "reason": _text(lr.get("reason"), 280),
            "params": _params(lr.get("params"), iid),
            "regions": regions,
        })
    if not layers:
        hint = f" Unknown instruments: {', '.join(unknown)}." if unknown else ""
        raise PlanError(f"The plan has no usable layers (check instrument ids, bars and regions).{hint}")
    layers.sort(key=lambda l: (ROLE_ORDER.index(l["role"]), l["id"]))

    genre = raw.get("genre") if raw.get("genre") in GENRES else (default_genre if default_genre in GENRES else "horror_trap")
    return {
        "genre": genre,
        "genre_name": GENRES[genre]["name"],
        "swing": round(_num(raw.get("swing"), 0.0, MAX_SWING, GENRES[genre]["swing"]), 3),
        "summary": _text(raw.get("summary"), 500),
        "reply": _text(raw.get("reply"), 900),
        "palette_reason": _text(raw.get("palette_reason"), 400),
        "bpm": analysis["bpm"],
        "key": analysis["key"],
        "key_pc": analysis["key_pc"],
        "mode": mode,
        "bars": bars,
        "offset_sec": analysis.get("offset_sec", 0.0),
        "sections": compute_sections(analysis["bar_levels"]),
        "layers": layers,
    }


# ---- helpers shared by planner, API and tests --------------------------------

def bars_text(regions: list[dict]) -> str:
    if not regions:
        return "nowhere"
    parts = []
    for r in regions:
        s, e = r["start_bar"], r["end_bar"]
        parts.append(f"bar {s}" if s == e else f"bars {s}-{e}")
    return ", ".join(parts)


def rescale_regions(raw_plan: dict, ratio: float) -> dict:
    """Map bar numbers to a new tempo (bars get shorter when tempo rises)."""
    out = dict(raw_plan)
    layers = []
    for lr in raw_plan.get("layers", []) if isinstance(raw_plan.get("layers"), list) else []:
        if not isinstance(lr, dict):
            continue
        lr = dict(lr)
        regs = []
        for r in lr.get("regions", []) if isinstance(lr.get("regions"), list) else []:
            if not isinstance(r, dict):
                continue
            try:
                s, e = int(r["start_bar"]), int(r["end_bar"])
            except (KeyError, TypeError, ValueError):
                continue
            ns = int((s - 1) * ratio) + 1
            ne = max(ns, math.ceil(e * ratio))
            regs.append({**r, "start_bar": ns, "end_bar": ne})
        lr["regions"] = regs
        layers.append(lr)
    out["layers"] = layers
    return out


def diff_plans(old: dict, new: dict) -> tuple[list[str], list[str]]:
    """Human-readable, truthful list of what changed between two clean plans."""
    changes: list[str] = []
    changed: list[str] = []
    if old.get("genre") != new.get("genre"):
        changes.append(f"Genre {old.get('genre_name', '?')} to {new.get('genre_name', '?')}")
    if old["bpm"] != new["bpm"]:
        changes.append(f"Tempo {old['bpm']} to {new['bpm']} BPM")
    if old.get("swing") != new.get("swing"):
        changes.append(f"Swing {round(old.get('swing', 0) * 100)}% to {round(new.get('swing', 0) * 100)}%")
    old_l = {l["id"]: l for l in old["layers"]}
    new_l = {l["id"]: l for l in new["layers"]}
    for lid in list(old_l) + [i for i in new_l if i not in old_l]:
        o, n = old_l.get(lid), new_l.get(lid)
        if o is None:
            changes.append(f"Added {n['name']} at {bars_text(n['regions'])}")
        elif n is None:
            changes.append(f"Removed {o['name']}")
        else:
            before = len(changes)
            span = lambda l: [(r["start_bar"], r["end_bar"]) for r in l["regions"]]
            if span(o) != span(n):
                changes.append(f"{n['name']} now plays at {bars_text(n['regions'])}")
            elif [r["pattern"] for r in o["regions"]] != [r["pattern"] for r in n["regions"]]:
                changes.append(f"{n['name']} rhythm/notes changed")
            if o["volume"] != n["volume"]:
                changes.append(f"{n['name']} volume {round(o['volume'] * 100)}% to {round(n['volume'] * 100)}%")
            for k, v in n["params"].items():
                if o["params"].get(k) != v:
                    changes.append(f"{n['name']} {k}: {o['params'].get(k)} to {v}")
            if o.get("patch") != n.get("patch"):
                renamed = o.get("patch") and n.get("patch") and o["name"] != n["name"]
                changes.append(f"Redesigned the sound ({o['name']} is now {n['name']})" if renamed else f"Redesigned the {n['name']} sound")
            if len(changes) == before:
                continue
        changed.append(lid)
    return changes, changed
