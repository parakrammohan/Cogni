"""Async SQLAlchemy engine + session factory.

The engine is created lazily so a missing DATABASE_URL produces a clear
error at use time rather than a confusing import-time failure.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import describe_db_url, get_settings

log = logging.getLogger("cogni.db")


class Base(DeclarativeBase):
    """Single declarative base shared by every ORM model."""


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _build_engine() -> AsyncEngine:
    settings = get_settings()
    url = settings.database_url_async
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Configure it on the HF Space as a secret "
            "(see docs/database.md). Example: postgres://user:pw@host:5432/db?sslmode=require"
        )
    parts = describe_db_url(settings.database_url or "")
    log.info("Connecting to Postgres: %s", parts)
    return create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        future=True,
    )


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        _engine = _build_engine()
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    if _sessionmaker is None:
        get_engine()
    return cast(async_sessionmaker[AsyncSession], _sessionmaker)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Async context manager for startup hooks, scripts, anywhere
    that isn't a request handler. Inside FastAPI routes use `get_db`."""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
