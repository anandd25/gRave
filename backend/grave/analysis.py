"""Librosa telemetry: BPM, key, brightness and per-bar vocal activity.

The telemetry is what the AI producer reasons about, so besides the headline
numbers it also describes *where* the vocal is: loudness per bar, which 16th
steps the syllables land on, and the dominant sung note per bar.
"""
import math

import numpy as np

from .audio_io import check_audio_path

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles.
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

HOP = 512
ANALYSIS_SR = 22050
MAX_SECONDS = 90


def bar_seconds(bpm: float) -> float:
    return 240.0 / bpm


def bar_count(duration: float, bpm: float) -> int:
    return int(min(64, max(4, math.ceil(duration / bar_seconds(bpm)) + 1)))


def _grid_offset(beat_times: np.ndarray, beat_len: float) -> float:
    """Where the beat grid starts, from the circular mean of beat phases."""
    if len(beat_times) < 4:
        return 0.0
    angles = 2 * np.pi * (beat_times % beat_len) / beat_len
    vec = np.exp(1j * angles).mean()
    if abs(vec) < 0.5:  # beats not consistent enough to trust
        return 0.0
    return round(float((np.angle(vec) % (2 * np.pi)) / (2 * np.pi) * beat_len), 3)


def _bar_levels(rms, frame_sec, bpm, bars, offset) -> list[float]:
    peak = float(rms.max()) or 1e-9
    bs = bar_seconds(bpm)
    out = []
    for b in range(bars):
        i0 = int((offset + b * bs) / frame_sec)
        i1 = min(len(rms), int((offset + (b + 1) * bs) / frame_sec))
        out.append(round(float(rms[i0:i1].mean() / peak), 3) if i1 > i0 else 0.0)
    return out


def _bar_onsets(onset_times, bpm, bars, offset) -> list[list[int]]:
    bs = bar_seconds(bpm)
    step = bs / 16
    onsets: list[set[int]] = [set() for _ in range(bars)]
    for t in onset_times:
        rel = float(t) - offset
        if rel < 0:
            continue
        slot = int(round(rel / step))  # global 16th index
        bar, s = divmod(slot, 16)
        if bar < bars:
            onsets[bar].add(s)
    return [sorted(s) for s in onsets]


def _detect_key(chroma, rms):
    n = min(chroma.shape[1], len(rms))
    profile = (chroma[:, :n] * rms[:n]).sum(axis=1)  # loud frames count more
    if not np.any(profile > 0):
        return 0, "minor", True
    best, best_pc, best_mode = -2.0, 0, "minor"
    for pc in range(12):
        for mode, ref in (("major", MAJOR), ("minor", MINOR)):
            c = float(np.corrcoef(profile, np.roll(ref, pc))[0, 1])
            if c > best:
                best, best_pc, best_mode = c, pc, mode
    return best_pc, best_mode, False


def _bar_notes(chroma, rms, frame_sec, bpm, bars, offset, key_pc) -> list:
    """Dominant sung pitch class per bar, as semitones above the key root (or None)."""
    peak = float(rms.max()) or 1e-9
    bs = bar_seconds(bpm)
    n = min(chroma.shape[1], len(rms))
    out = []
    for b in range(bars):
        i0 = int((offset + b * bs) / frame_sec)
        i1 = min(n, int((offset + (b + 1) * bs) / frame_sec))
        if i1 <= i0 or rms[i0:i1].mean() / peak < 0.12:
            out.append(None)
            continue
        weights = rms[i0:i1]
        profile = (chroma[:, i0:i1] * weights).sum(axis=1)
        out.append(int((int(np.argmax(profile)) - key_pc) % 12))
    return out


def analyze_vocal(path: str, bpm_override: float | None = None) -> dict:
    """Extract musical telemetry from a vocal take."""
    import librosa

    p = check_audio_path(path)
    y, sr = librosa.load(str(p), sr=ANALYSIS_SR, mono=True, duration=MAX_SECONDS)
    if y.size < sr // 2:
        raise ValueError("Audio is too short to analyze (need at least half a second).")

    duration = float(librosa.get_duration(y=y, sr=sr))
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    frame_sec = HOP / sr

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=HOP)
    bpm = float(np.atleast_1d(tempo)[0])
    bpm_fallback = not np.isfinite(bpm) or bpm <= 0
    if bpm_fallback:
        bpm = 140.0
    while bpm > 160:
        bpm /= 2
    while bpm < 70:
        bpm *= 2
    detected = round(bpm)
    detected_fallback = bpm_fallback
    if bpm_override:
        bpm, bpm_fallback = float(min(200, max(60, bpm_override))), False
    bpm = round(bpm)

    # Align the beat grid to the vocal. Half/double time (genre tempo folding) keeps the
    # detected grid; any other forced tempo no longer matches the voice, so start at 0.
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)
    detected_offset = 0.0 if detected_fallback else _grid_offset(beat_times, 60.0 / detected)
    ratio = bpm / detected
    related = any(abs(ratio - r) < 0.03 for r in (0.5, 1.0, 2.0))
    offset = round(detected_offset % (60.0 / bpm), 3) if related else 0.0

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    pc, mode, key_fallback = _detect_key(chroma, rms)

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP)[0]
    n = min(len(centroid), len(rms))
    voiced = rms[:n] > 0.15 * rms.max()
    brightness = float(np.median(centroid[:n][voiced] if voiced.any() else centroid[:n]))

    onset_times = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=HOP, units="time"
    )

    bars = bar_count(duration, bpm)
    return {
        "bpm": bpm,
        "detected_bpm": detected,
        "bpm_fallback": bool(bpm_fallback),
        "key_pc": pc,
        "mode": mode,
        "key": f"{NOTE_NAMES[pc]} {mode}",
        "key_fallback": bool(key_fallback),
        "brightness_hz": round(brightness),
        "duration_sec": round(duration, 2),
        "bars": bars,
        "offset_sec": offset,
        "bar_levels": _bar_levels(rms, frame_sec, bpm, bars, offset),
        "bar_onsets": _bar_onsets(onset_times, bpm, bars, offset),
        "bar_notes": _bar_notes(chroma, rms, frame_sec, bpm, bars, offset, pc),
    }
