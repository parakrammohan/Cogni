"""Shared FastAPI dependencies — session-cookie based auth."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crud import session as crud_session
from app.db import get_sessionmaker
from app.lib.errors import AuthError
from app.models.user import User

_settings = get_settings()


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    request: Request,
    db: DbDep,
    cogni_session: Annotated[str | None, Cookie(alias=_settings.session_cookie_name)] = None,
) -> User:
    if not cogni_session:
        raise AuthError("Not signed in")
    found = await crud_session.get_active_with_user(db, cogni_session)
    if found is None:
        raise AuthError("Session invalid or expired")

    session_row, user = found
    # Slide the last_used_at timestamp. Cheap (~1 UPDATE), gives us a
    # "last active" signal per session row for future device management.
    await crud_session.touch(db, session_row)

    # Stash on the request so route handlers + future middleware can read
    # the session row directly without another lookup.
    request.state.session = session_row
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
