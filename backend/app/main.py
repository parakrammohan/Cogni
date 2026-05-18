"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.routes import router as admin_router
from app.api.router import api_v1
from app.config import describe_db_url, get_settings
from app.lib.csrf import OriginCsrfMiddleware
from app.lib.errors import install_exception_handlers
from app.lib.request_log import RequestLogMiddleware
from app.seed import seed_demo_users

log = logging.getLogger("cogni.main")
settings = get_settings()

_STARTED_AT = datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Schema migrations run from the Docker CMD before uvicorn boots
    (see Dockerfile). Here we only do the demo-account seed."""
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(levelname)-5s [%(name)s] %(message)s",
    )
    log.info("Boot: env=%s, db=%s", settings.environment, describe_db_url(settings.database_url or ""))
    try:
        await seed_demo_users()
    except Exception:  # don't take the whole app down for seed failures
        log.exception("Demo seed failed; continuing without it.")
    yield


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

app.include_router(api_v1)
app.include_router(admin_router)


@app.get("/health")
async def health() -> dict[str, object]:
    """Process liveness — no DB hit; use /api/v1/health/db for that."""
    return {"ok": True, "started_at": _STARTED_AT}
