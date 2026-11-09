from pathlib import Path

import numpy as np

ALLOWED_SUFFIXES = {".wav", ".mp3", ".flac", ".ogg", ".aif", ".aiff", ".m4a"}


def check_audio_path(path: str) -> Path:
    """Validate that `path` is an existing audio file we know how to read."""
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise FileNotFoundError(f"Audio file not found: {p}")
    if p.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ValueError(
            f"Unsupported audio type '{p.suffix}'. Use one of: {', '.join(sorted(ALLOWED_SUFFIXES))}"
        )
    return p


def load_audio(path: Path) -> tuple[np.ndarray, int]:
    """Load audio as float32 array shaped (channels, samples) at its native rate."""
    import librosa

    audio, sr = librosa.load(str(path), sr=None, mono=False)
    if audio.ndim == 1:
        audio = audio[np.newaxis, :]
    return audio.astype(np.float32), int(sr)
