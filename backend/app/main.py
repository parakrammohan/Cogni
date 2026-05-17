"""FastAPI application entry point.

Lifespan handler:
  - Runs `alembic upgrade head` so the schema is at the latest revision
    before we accept traffic.
  - Seeds demo accounts (unless SEED_DEMO_USERS=false).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_v1
from app.config import get_settings
from app.lib.errors import install_exception_handlers
from app.seed import seed_demo_users

log = logging.getLogger("cogni.main")
settings = get_settings()

_STARTED_AT = datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Schema migrations run from the Docker CMD before uvicorn boots
    (see Dockerfile), so the only startup work left for the running
    event loop is the demo-account seed."""
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(levelname)-5s [%(name)s] %(message)s",
    )
    try:
        await seed_demo_users()
    except Exception:  # don't take the whole app down for seed failures
        log.exception("Demo seed failed; continuing without it.")
    yield


app = FastAPI(
    title="Cogni API",
    version="0.2.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

install_exception_handlers(app)

app.include_router(api_v1)


@app.get("/health")
async def health() -> dict[str, object]:
    """Process liveness — no DB hit; use /api/v1/health/db for that."""
    return {"ok": True, "started_at": _STARTED_AT}
