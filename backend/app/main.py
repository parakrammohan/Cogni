"""FastAPI application entry point.

Stage 0: health + version endpoints only. Subsequent stages plug in
auth, pairing, resources, websocket, and ML routers from `app.api.v1`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Cogni API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STARTED_AT = datetime.now(timezone.utc).isoformat()


@app.get("/health")
async def health() -> dict[str, object]:
    """Liveness probe. Used by uptime pings and the CI deploy step."""
    return {"ok": True, "started_at": _STARTED_AT}


@app.get("/api/v1/version")
async def version() -> dict[str, str | None]:
    return {
        "version": settings.git_sha,
        "started_at": _STARTED_AT,
        "environment": settings.environment,
    }
