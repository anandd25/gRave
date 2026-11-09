"""gRave Producer MCP server.

Exposes the audio engine as tools so Kiro's agent can act as a horror sound
designer: listen (analyze), pick instruments from the catalog, author a beat
plan, validate it, and curse vocals. Kiro's agent is the "AI" here; the web app
uses grave/producer_ai.py with Groq.

Runs over stdio. Never print to stdout here: it carries the MCP protocol.
"""
import re
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from grave import genres, research
from grave.analysis import analyze_vocal as _analyze
from grave.arrange import rule_based_plan
from grave.fx import curse_vocal as _curse
from grave.instruments import catalog_spec
from grave.patch import patch_prompt, sanitize_patch
from grave.plan_schema import PlanError, sanitize_plan

OUTPUT_DIR = Path(__file__).parent / "output"

mcp = FastMCP("grave-producer")


@mcp.tool()
def analyze_vocal(path: str) -> dict:
    """Listen to a vocal take. Returns BPM, key, mode, brightness (Hz), duration,
    bar count, beat-grid offset, and per-bar vocal loudness (bar_levels), syllable
    positions on the 16th-note grid (bar_onsets) and dominant sung note (bar_notes).

    Args:
        path: Absolute path to a WAV/MP3/FLAC/OGG vocal file.
    """
    return _analyze(path)


@mcp.tool()
def list_instruments() -> dict:
    """The instrument catalog: every ready-made instrument, with its kind
    (hits / melodic / chords / sustained), sound description, params and ranges,
    plus the recipe format for designing CUSTOM instruments.

    Pattern rules: hits use pattern.steps (+fill_steps); melodic adds pattern.degrees
    (scale degree per step, 0 = key root); chords use pattern.degrees as the chord root
    for each 2 bars; sustained needs no pattern.
    """
    return {"catalog": catalog_spec(), "custom_instruments": patch_prompt()}


@mcp.tool()
def design_instrument(patch: dict) -> dict:
    """Check a custom instrument (synth patch) you designed. Returns the patch with
    every value clamped to a playable range. Use the result in a plan layer as
    {"instrument": "custom", "kind": ..., "role": ..., "patch": <patch>, "regions": [...]}.
    Call list_instruments for the patch format and sound-design recipes.

    Args:
        patch: The synth patch: name, sources, octave, pitch_env, fm, filter, amp_env, lfo, drive, bitcrush, echo.
    """
    return {"ok": True, "patch": sanitize_patch(patch)}


@mcp.tool()
def list_genres() -> list:
    """The genres the producer knows, with usual tempo range and a production guide
    (drum patterns, swing, typical instruments, chord style) for each."""
    return genres.genre_spec()


@mcp.tool()
def draft_plan(path: str, brief: str = "", genre: str = "auto", bpm: int = 0) -> dict:
    """Get a rule-based draft beat plan for a vocal (a starting point, not the final
    word). Its palette and drum patterns follow the genre, plus keywords in the brief.
    Edit it, then pass it to validate_plan. Bars are 1-based and inclusive.

    Args:
        path: Absolute path to the vocal file.
        brief: Optional description of what the user wants.
        genre: A genre id from list_genres, or "auto" to pick one from the brief and vocal.
        bpm: Optional tempo override (60-200). 0 keeps the detected tempo, folded to half/double time for the genre.
    """
    analysis = _analyze(path, bpm_override=bpm or None)
    gid = genres.resolve(genre, brief, analysis)
    if not bpm:
        fitted = genres.fit_tempo(gid, analysis["bpm"])
        if fitted != analysis["bpm"]:
            analysis = _analyze(path, bpm_override=fitted)
    return rule_based_plan(analysis, brief, gid)


@mcp.tool()
def validate_plan(path: str, plan: dict) -> dict:
    """Validate and normalize a beat plan that YOU authored against the real vocal.
    Returns the clean plan the web app can play, or an error explaining what to fix.

    Plan shape: {"genre","swing","summary","reply","palette_reason","layers":[{"instrument","id","volume",
    "reason","params","regions":[{"start_bar","end_bar","why","pattern":{"steps","degrees","fill_steps"}}]}]}

    Args:
        path: Absolute path to the vocal file the plan is for.
        plan: The plan object.
    """
    try:
        return {"ok": True, "plan": sanitize_plan(plan, _analyze(path))}
    except PlanError as e:
        return {"ok": False, "error": str(e)}


@mcp.tool()
def research_style(query: str) -> dict:
    """Search the web (Tavily) for how a style is produced: typical instruments,
    drum patterns, tempo and sound design. Needs TAVILY_API_KEY in backend/.env.

    Args:
        query: The style or reference, e.g. "Memphis horrorcore" or "horror movie trailer".
    """
    found = research.research(query)
    if found is None:
        return {"ok": False, "error": "Web research is not configured (add TAVILY_API_KEY to backend/.env)."}
    if found.get("error"):
        return {"ok": False, "error": found["error"]}
    return {"ok": True, **found}


@mcp.tool()
def curse_vocal(
    path: str,
    pitch_semitones: float = -3.0,
    formant_warp: float = -30.0,
    reverb_mix: float = 0.4,
    grit: float = 0.0,
    output_name: str = "cursed_vocal.wav",
) -> dict:
    """Turn a clean vocal into a cursed specter (pitch shift, formant-style tilt,
    crypt convolution reverb, optional grit). Writes into backend/output/.

    Args:
        path: Absolute path to the clean vocal.
        pitch_semitones: -12..12. Try -2 to -4 for a haunted tone.
        formant_warp: -100..100. Negative = darker, bigger throat. Positive = thin, ghostly.
        reverb_mix: 0..1 wet amount of the crypt reverb.
        grit: 0..1 distortion.
        output_name: File name for the result (saved inside backend/output/).
    """
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", Path(output_name).name) or "cursed_vocal.wav"
    if not safe.lower().endswith(".wav"):
        safe += ".wav"
    return _curse(path, str(OUTPUT_DIR / safe), pitch_semitones, formant_warp, reverb_mix, grit)


if __name__ == "__main__":
    mcp.run()
