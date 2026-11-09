"""Cursed vocal DSP with Spotify's Pedalboard."""
import tempfile
from pathlib import Path

import numpy as np

from .audio_io import check_audio_path, load_audio


def _crypt_impulse(sr: int, seconds: float = 2.8, seed: int = 7) -> np.ndarray:
    """Synthetic cathedral/crypt impulse response (decaying stereo noise)."""
    rng = np.random.default_rng(seed)
    n = int(sr * seconds)
    fade = (1 - np.linspace(0, 1, n)) ** 3
    ir = rng.uniform(-1, 1, (n, 2)) * fade[:, None]
    return (ir / np.abs(ir).max()).astype(np.float32)


def curse_vocal(
    path: str,
    output_path: str,
    pitch_semitones: float = -3.0,
    formant_warp: float = -30.0,
    reverb_mix: float = 0.4,
    grit: float = 0.0,
) -> dict:
    """Turn a clean vocal into a cursed specter.

    pitch_semitones: -12..12 (negative = demonic)
    formant_warp:    -100..100. Pedalboard has no true formant shifter, so this
                     is a spectral-tilt approximation: negative = bigger, darker
                     "throat", positive = thin, ghostly.
    reverb_mix:      0..1 convolution reverb wet amount (synthetic crypt IR)
    grit:            0..1 distortion drive
    """
    import soundfile as sf
    from pedalboard import (
        Convolution, Distortion, HighShelfFilter, Limiter, LowShelfFilter,
        Pedalboard, PitchShift,
    )

    src = check_audio_path(path)
    pitch = float(np.clip(pitch_semitones, -12, 12))
    formant = float(np.clip(formant_warp, -100, 100))
    wet = float(np.clip(reverb_mix, 0, 1))
    drive = float(np.clip(grit, 0, 1))

    audio, sr = load_audio(src)
    tilt_db = -formant / 100 * 6  # negative warp -> boost lows, cut highs

    with tempfile.TemporaryDirectory() as tmp:
        board_fx = [PitchShift(semitones=pitch)]
        if abs(tilt_db) > 0.1:
            board_fx += [
                LowShelfFilter(cutoff_frequency_hz=300, gain_db=tilt_db),
                HighShelfFilter(cutoff_frequency_hz=3000, gain_db=-tilt_db),
            ]
        if drive > 0:
            board_fx.append(Distortion(drive_db=drive * 20))
        if wet > 0:
            ir_path = Path(tmp) / "crypt_ir.wav"
            sf.write(str(ir_path), _crypt_impulse(sr), sr)
            board_fx.append(Convolution(str(ir_path), mix=wet))
        board_fx.append(Limiter(threshold_db=-1.0))
        processed = Pedalboard(board_fx)(audio, sr)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), processed.T, sr)
    return {
        "output_path": str(out),
        "sample_rate": sr,
        "duration_sec": round(processed.shape[1] / sr, 2),
        "applied": {
            "pitch_semitones": pitch,
            "formant_warp": formant,
            "reverb_mix": wet,
            "grit": drive,
        },
    }
