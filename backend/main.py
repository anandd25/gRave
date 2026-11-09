"""FastAPI app for the gRave frontend. Run from backend/: uvicorn main:app --port 8000"""
import atexit
import json
import shutil
import tempfile
import uuid
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from grave import genres, llm, producer_ai, research
from grave.analysis import analyze_vocal
from grave.audio_io import ALLOWED_SUFFIXES
from grave.instruments import catalog_spec
from grave.patch import patch_spec
from grave.fx import curse_vocal
from grave.llm import LLMError
from grave.plan_schema import PlanError

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_SESSIONS = 8

app = FastAPI(title="gRave", description="Haunted AI audio studio backend")

# Uploaded vocals live in a temp folder so chat revisions can re-analyze them.
SESSION_ROOT = Path(tempfile.mkdtemp(prefix="grave_"))
atexit.register(shutil.rmtree, SESSION_ROOT, ignore_errors=True)
SESSIONS: "OrderedDict[str, dict]" = OrderedDict()


def _remember(session_id: str, path: Path, analysis: dict) -> None:
    SESSIONS[session_id] = {"path": path, "analysis": analysis}
    while len(SESSIONS) > MAX_SESSIONS:
        _, old = SESSIONS.popitem(last=False)
        shutil.rmtree(old["path"].parent, ignore_errors=True)


class CurseSettings(BaseModel):
    pitch_semitones: float = Field(-3.0, ge=-12, le=12)
    formant_warp: float = Field(-30.0, ge=-100, le=100)
    reverb_mix: float = Field(0.4, ge=0, le=1)
    grit: float = Field(0.0, ge=0, le=1)


class ReviseBody(BaseModel):
    session_id: str
    plan: dict  # includes "bpm" so undo/redo can re-sync the backend's analysis
    message: str = Field(min_length=1, max_length=1000)


async def _save_upload(file: UploadFile, folder: Path) -> Path:
    # Never trust the client filename: keep only a vetted suffix.
    suffix = Path(file.filename or "").suffix.lower() or ".wav"
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(415, f"Unsupported audio type '{suffix}'. Use WAV, MP3, FLAC or OGG.")
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"vocal{suffix}"
    size = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "File too large (25 MB max).")
            out.write(chunk)
    return dest


@app.get("/api/health")
def health():
    return {"status": "alive", "haunted": True}


@app.get("/api/status")
def status():
    return {"ai": llm.describe(), "research": {"configured": research.configured()}}


@app.get("/api/instruments")
def instruments():
    return catalog_spec()


@app.get("/api/patch-spec")
def get_patch_spec():
    return patch_spec()


@app.get("/api/genres")
def get_genres():
    return genres.genre_spec()


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), bpm: float | None = Form(None)):
    with tempfile.TemporaryDirectory() as tmp:
        path = await _save_upload(file, Path(tmp))
        try:
            return await run_in_threadpool(analyze_vocal, str(path), bpm)
        except Exception as e:
            raise HTTPException(422, f"Could not analyze that audio: {e}") from e


@app.post("/api/produce")
async def produce(
    file: UploadFile = File(...),
    brief: str = Form(""),
    genre: str = Form(genres.AUTO),
    bpm: float | None = Form(None),
):
    """Analyze the vocal, then let the AI producer plan the beat around it."""
    if genre != genres.AUTO and not genres.valid(genre):
        raise HTTPException(422, f"Unknown genre '{genre[:40]}'.")
    session_id = uuid.uuid4().hex
    folder = SESSION_ROOT / session_id
    try:
        path = await _save_upload(file, folder)
        try:
            analysis = await run_in_threadpool(analyze_vocal, str(path), bpm)
        except Exception as e:
            raise HTTPException(422, f"Could not analyze that audio: {e}") from e

        def reanalyze(new_bpm: int) -> dict:  # half/double time for the genre
            return analyze_vocal(str(path), new_bpm)

        result = await run_in_threadpool(producer_ai.produce, analysis, brief[:1000], genre, reanalyze)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    _remember(session_id, path, result["analysis"])
    return {"session_id": session_id, **result}


@app.post("/api/revise")
def revise(body: ReviseBody):
    """Apply a chat request to the current plan using the AI producer."""
    session = SESSIONS.get(body.session_id)
    if session is None:
        raise HTTPException(404, "That session expired (the backend restarted). Re-add your vocal.")

    def reanalyze(bpm: int) -> dict:
        fresh = analyze_vocal(str(session["path"]), bpm)
        session["analysis"] = fresh
        return fresh

    try:
        client_bpm = body.plan.get("bpm")
        if isinstance(client_bpm, (int, float)) and 60 <= client_bpm <= 200 and int(client_bpm) != session["analysis"]["bpm"]:
            reanalyze(int(client_bpm))  # the UI is at a different tempo (e.g. after undo)
        return producer_ai.revise(session["analysis"], body.plan, body.message, reanalyze)
    except LLMError as e:
        raise HTTPException(503, str(e)) from e
    except PlanError as e:
        raise HTTPException(502, f"The AI answered, but not with a usable plan: {e}") from e


@app.post("/api/curse")
async def curse(file: UploadFile = File(...), settings: str = Form("{}")):
    try:
        cfg = CurseSettings(**json.loads(settings))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, f"Bad settings: {e}") from e

    tmp = Path(tempfile.mkdtemp())
    try:
        path = await _save_upload(file, tmp)
        out = tmp / "cursed.wav"
        await run_in_threadpool(curse_vocal, str(path), str(out), **cfg.model_dump())
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return FileResponse(
        out, media_type="audio/wav", filename="cursed.wav",
        background=BackgroundTask(shutil.rmtree, tmp, ignore_errors=True),
    )
