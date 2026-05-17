"""Health probe (DB ping) + version metadata."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.deps import DbDep

router = APIRouter(tags=["health"])

_STARTED_AT = datetime.now(timezone.utc).isoformat()
_settings = get_settings()


@router.get("/version")
async def version() -> dict[str, str | None]:
    return {
        "version": _settings.git_sha,
        "started_at": _STARTED_AT,
        "environment": _settings.environment,
    }


@router.get("/health/db")
async def health_db(db: DbDep) -> dict[str, object]:
    """Verifies the DB is reachable. Use sparingly — every call hits Postgres."""
    await db.execute(text("SELECT 1"))
    return {"ok": True}
