"""Async SQLAlchemy engine + session factory.

One global async engine for the process. `get_session()` is a FastAPI
dependency that opens a per-request `AsyncSession`, commits on success,
rolls back on exception, and always closes.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url_async,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)

SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    """Single declarative base shared by every ORM model."""


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Async context manager — for startup hooks, scripts, anywhere
    that isn't a request handler. Inside FastAPI routes use `get_db`."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
