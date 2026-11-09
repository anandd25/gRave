"""Minimal LLM client over httpx: Groq, Anthropic, or any OpenAI-compatible server.

Configuration comes from the environment or backend/.env. Keys are never logged
or returned to the frontend.
"""
import functools
import os
import re
from pathlib import Path

import httpx

TIMEOUT = 120.0
GROQ_BASE = "https://api.groq.com/openai/v1"
# Groq retired its free Llama models in Aug 2026. If this 404s, the error lists live models.
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
MIN_ANSWER_TOKENS = 2200  # a full plan JSON plus short reasoning
MAX_ANSWER_TOKENS = 6000


class LLMError(RuntimeError):
    """The model could not be reached or returned an error."""


@functools.lru_cache(maxsize=1)
def tls():
    """TLS verification setting for httpx.

    Prefer the operating system's certificate store (via `truststore`). Antivirus
    HTTPS scanning (Kaspersky, ESET, ...) and corporate proxies install their root
    certificate there, but Python's bundled list does not know it. Verification
    stays ON either way.
    """
    try:
        import ssl

        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        return True


def load_dotenv() -> None:
    """Read backend/.env. Names are upper-cased so `groq_api=` and `GROQ_API=` both work."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        if value:
            os.environ.setdefault(key.strip().upper(), value)


def get_config() -> dict | None:
    """Return the active provider config, or None when no model is configured."""
    load_dotenv()
    env = os.environ.get
    model = env("GRAVE_LLM_MODEL")
    base = env("GRAVE_LLM_BASE_URL")

    groq_key = env("GROQ_API_KEY") or env("GROQ_API")
    if groq_key and not base:
        return {"provider": "groq", "key": groq_key, "model": model or GROQ_DEFAULT_MODEL, "base": GROQ_BASE}
    if env("ANTHROPIC_API_KEY") and not base:
        return {
            "provider": "anthropic", "key": env("ANTHROPIC_API_KEY"),
            "model": model or "claude-sonnet-4-5", "base": "https://api.anthropic.com",
        }
    if base or env("OPENAI_API_KEY"):
        if base and not model:
            return None  # a local server needs an explicit model name
        return {
            "provider": "openai", "key": env("GRAVE_LLM_API_KEY") or env("OPENAI_API_KEY") or "",
            "model": model or "gpt-4o-mini", "base": (base or "https://api.openai.com/v1").rstrip("/"),
        }
    return None


def _tpm_limit() -> int:
    """Tokens-per-minute budget per request. Groq free tier is 8000 for gpt-oss-120b."""
    try:
        return max(2000, int(os.environ.get("GRAVE_LLM_TPM", "8000")))
    except ValueError:
        return 8000


def estimate_tokens(text: str) -> int:
    """Rough, deliberately high token estimate (JSON-heavy text runs ~3 chars/token)."""
    return len(text) // 3 + 20


def _answer_budget(system: str, user: str) -> int:
    room = _tpm_limit() - estimate_tokens(system) - estimate_tokens(user) - 300
    return max(MIN_ANSWER_TOKENS, min(MAX_ANSWER_TOKENS, room))


def _tpm_numbers(body: str) -> tuple[int | None, int | None]:
    m = re.search(r"Limit (\d+), Requested (\d+)", body or "")
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def describe() -> dict:
    cfg = get_config()
    if not cfg:
        return {"configured": False, "provider": None, "model": None}
    return {"configured": True, "provider": cfg["provider"], "model": cfg["model"]}


def _available_models(cfg: dict) -> list[str]:
    """Best-effort list of chat models this key can use (OpenAI-compatible /models)."""
    try:
        headers = {"Authorization": f"Bearer {cfg['key']}"} if cfg["key"] else {}
        r = httpx.get(f"{cfg['base']}/models", headers=headers, timeout=10.0, verify=tls())
        r.raise_for_status()
        ids = [m.get("id", "") for m in r.json().get("data", [])]
    except (httpx.HTTPError, ValueError):
        return []
    skip = ("whisper", "orpheus", "guard", "safeguard", "tts", "embed")
    return [i for i in ids if i and not any(s in i.lower() for s in skip)][:8]


def _explain(cfg: dict, e: httpx.HTTPStatusError) -> str:
    code = e.response.status_code
    body = e.response.text[:300]
    if cfg["key"]:
        body = body.replace(cfg["key"], "***")
    if code == 401:
        return f"{cfg['provider']} rejected the API key (401). Check the key in backend/.env."
    if code == 413:
        return (f"{cfg['provider']} said the request is too large for your plan's tokens-per-minute limit. "
                "Try a shorter brief, or set GRAVE_LLM_MODEL=openai/gpt-oss-20b in backend/.env.")
    if code == 429:
        wait = e.response.headers.get("retry-after")
        hint = f" Try again in about {wait}s." if wait else " Wait a minute and try again."
        extra = (
            " You can also set GRAVE_LLM_MODEL=openai/gpt-oss-20b, which is faster and lighter."
            if cfg["provider"] == "groq" else ""
        )
        return f"{cfg['provider']} rate limit reached.{hint}{extra}"
    if code == 404 or (code == 400 and "model" in body.lower()):
        live = _available_models(cfg)
        options = f" Models available to your key: {', '.join(live)}." if live else ""
        return (
            f"{cfg['provider']} cannot use model '{cfg['model']}' ({code}). "
            f"Set GRAVE_LLM_MODEL in backend/.env.{options}"
        )
    return f"{cfg['provider']} returned {code}: {body}"


def complete(system: str, user: str) -> str:
    cfg = get_config()
    if not cfg:
        raise LLMError("No AI model configured. Add a key to backend/.env (see backend/.env.example).")
    try:
        if cfg["provider"] == "anthropic":
            r = httpx.post(
                f"{cfg['base']}/v1/messages",
                headers={"x-api-key": cfg["key"], "anthropic-version": "2023-06-01"},
                json={
                    "model": cfg["model"], "max_tokens": 6000, "temperature": 0.8,
                    "system": system, "messages": [{"role": "user", "content": user}],
                },
                timeout=TIMEOUT,
                verify=tls(),
            )
            r.raise_for_status()
            return "".join(b.get("text", "") for b in r.json().get("content", []))

        headers = {"Authorization": f"Bearer {cfg['key']}"} if cfg["key"] else {}
        payload = {
            "model": cfg["model"], "temperature": 0.8,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if cfg["provider"] == "groq":
            # Groq counts the reserved answer tokens toward the per-minute limit, so reserve
            # only what is left after the prompt. JSON mode keeps the plan parseable;
            # gpt-oss models "think" first, so keep that short.
            payload["max_completion_tokens"] = _answer_budget(system, user)
            payload["response_format"] = {"type": "json_object"}
            if "gpt-oss" in cfg["model"]:
                payload["reasoning_effort"] = "low"
        url = f"{cfg['base']}/chat/completions"
        r = httpx.post(url, headers=headers, json=payload, timeout=TIMEOUT, verify=tls())
        if r.status_code == 413 and "max_completion_tokens" in payload:
            # Our estimate was off: use Groq's own numbers and retry once.
            limit, requested = _tpm_numbers(r.text)
            if limit and requested:
                smaller = payload["max_completion_tokens"] - (requested - limit) - 200
                if smaller >= MIN_ANSWER_TOKENS:
                    payload["max_completion_tokens"] = smaller
                    r = httpx.post(url, headers=headers, json=payload, timeout=TIMEOUT, verify=tls())
        if r.status_code == 400 and "response_format" in payload:
            # This model may not support JSON mode or reasoning_effort: retry plain.
            for optional in ("response_format", "reasoning_effort"):
                payload.pop(optional, None)
            r = httpx.post(url, headers=headers, json=payload, timeout=TIMEOUT, verify=tls())
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"] or ""
    except httpx.HTTPStatusError as e:
        raise LLMError(_explain(cfg, e)) from None
    except httpx.HTTPError as e:
        if "CERTIFICATE_VERIFY_FAILED" in str(e):
            raise LLMError(
                "Your antivirus or network is inspecting HTTPS and Python does not trust its certificate. "
                "Fix: in backend/, run  .\\.venv\\Scripts\\python.exe -m pip install truststore  then restart the backend."
            ) from None
        raise LLMError(f"Could not reach the AI model ({type(e).__name__}).") from None
    except (KeyError, IndexError, ValueError):
        raise LLMError("The AI model sent a response I could not read.") from None
