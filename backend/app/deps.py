"""Shared FastAPI dependencies."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.lib.errors import AuthError
from app.models.user import User
from app.security import decode_access_token


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]


def _strip_bearer(authorization: str | None) -> str:
    if not authorization:
        raise AuthError("Missing Authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("Authorization header must be 'Bearer <token>'")
    return parts[1]


async def get_current_user(
    db: DbDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    token = _strip_bearer(authorization)
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise AuthError("Token expired")
    except jwt.PyJWTError:
        raise AuthError("Invalid token")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise AuthError("Malformed token payload")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise AuthError("User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
