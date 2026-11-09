"""Tavily web research: lets the producer look up the style the user asks for.

Only the user's brief or chat message is sent to Tavily, never the audio.
"""
import functools
import os
import re

import httpx

from .llm import load_dotenv, tls

TAVILY_URL = "https://api.tavily.com/search"
MAX_NOTES = 1200  # keeps the AI request inside Groq's free-tier token limit

# Chat messages that ask for a style/reference worth looking up.
STYLE_HINT = re.compile(
    r"\b(like|style|genre|type beat|vibe|inspired|sounds? like|era|reference|"
    r"search|look up|research)\b",
    re.IGNORECASE,
)


class ResearchError(RuntimeError):
    """Tavily could not be reached or refused the request."""


def _key() -> str | None:
    load_dotenv()
    return os.environ.get("TAVILY_API_KEY") or os.environ.get("TAVILY_API")


def configured() -> bool:
    return bool(_key())


@functools.lru_cache(maxsize=32)
def _search(query: str) -> tuple[str, tuple]:
    key = _key()
    try:
        r = httpx.post(
            TAVILY_URL,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "query": query, "search_depth": "basic", "max_results": 5,
                "chunks_per_source": 2, "include_answer": "basic",
            },
            timeout=25.0,
            verify=tls(),
        )
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code == 401:
            raise ResearchError("Tavily rejected the API key (401). Check TAVILY_API_KEY in backend/.env.") from None
        if code in (429, 432, 433):
            raise ResearchError("Tavily usage limit reached, so I planned without web research.") from None
        raise ResearchError(f"Tavily returned {code}.") from None
    except httpx.HTTPError as e:
        raise ResearchError(f"Could not reach Tavily ({type(e).__name__}).") from None
    except ValueError:
        raise ResearchError("Tavily sent a response I could not read.") from None
    results = tuple(
        (str(x.get("title", ""))[:120], str(x.get("url", "")), str(x.get("content", "")))
        for x in data.get("results", [])
        if isinstance(x, dict)
    )
    return str(data.get("answer") or ""), results


def research(text: str) -> dict | None:
    """Look up production details for a style. Returns None when not configured."""
    text = " ".join((text or "").split())
    if not text or not configured():
        return None
    query = f"{text[:250]} music production: typical instruments, drum patterns, tempo, sound design"[:390]
    try:
        answer, results = _search(query)
    except ResearchError as e:
        return {"error": str(e)}
    notes = answer.strip()
    for title, _url, content in results:
        if len(notes) >= MAX_NOTES:
            break
        notes += f"\n- {title}: {' '.join(content.split())[:300]}"
    return {
        "query": query,
        "notes": notes[:MAX_NOTES].strip(),
        "sources": [{"title": t or u, "url": u} for t, u, _ in results if u.startswith("http")][:4],
    }
