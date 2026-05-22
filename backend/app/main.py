"""FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.admin.routes import router as admin_router
from app.api.router import api_v1
from app.config import describe_db_url, get_settings
from app.db import session_scope
from app.lib.csrf import OriginCsrfMiddleware
from app.lib.error_log import install as install_error_ring
from app.lib.errors import install_exception_handlers
from app.lib.request_log import RequestLogMiddleware
from app.seed import seed_demo_users

log = logging.getLogger("cogni.main")
settings = get_settings()

_STARTED_AT = datetime.now(timezone.utc).isoformat()
_KEEPALIVE_INTERVAL_SECONDS = 4 * 60  # Aiven free tier idles faster than HF's 48h sleep


async def _keepalive_loop() -> None:
    """Ping the DB every few minutes so Aiven's free-tier Postgres
    doesn't suspend mid-day. HF Spaces only sleep after 48h of no
    requests, but Aiven idles much sooner. Cheap `SELECT 1`."""
    while True:
        try:
            await asyncio.sleep(_KEEPALIVE_INTERVAL_SECONDS)
            async with session_scope() as db:
                await db.execute(text("SELECT 1"))
        except asyncio.CancelledError:
            raise
        except Exception:  # never let the loop die from a transient blip
            log.exception("DB keep-alive ping failed; retrying next tick.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Schema migrations run from the Docker CMD before uvicorn boots
    (see Dockerfile). Here we seed demo accounts and start the DB
    keep-alive ping."""
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(levelname)-5s [%(name)s] %(message)s",
    )
    log.info("Boot: env=%s, db=%s", settings.environment, describe_db_url(settings.database_url or ""))
    try:
        await seed_demo_users()
    except Exception:  # don't take the whole app down for seed failures
        log.exception("Demo seed failed; continuing without it.")
    keepalive_task = asyncio.create_task(_keepalive_loop(), name="db-keepalive")
    try:
        yield
    finally:
        keepalive_task.cancel()
        try:
            await keepalive_task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(
    title="Cogni API",
    version="0.3.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# CORS first — sets up the response headers for cross-origin XHR.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Origin check on writes — defence in depth on top of CORS.
app.add_middleware(OriginCsrfMiddleware, allowed_origins=settings.cors_origins_list)
# In-memory request log; viewed from the admin dashboard.
app.add_middleware(RequestLogMiddleware)

install_exception_handlers(app)
# Capture ERROR-level log records into an in-memory ring buffer so the
# admin dashboard can show recent tracebacks (screening 500s, etc.)
# without ssh'ing into the HF Space.
install_error_ring()

app.include_router(api_v1)
app.include_router(admin_router)


@app.get("/health")
async def health() -> dict[str, object]:
    """Process liveness — no DB hit; use /api/v1/health/db for that."""
    return {"ok": True, "started_at": _STARTED_AT}
