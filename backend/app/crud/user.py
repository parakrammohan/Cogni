from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.security import hash_password


async def get_by_username(db: AsyncSession, username: str) -> User | None:
    res = await db.execute(select(User).where(User.username == username.lower()))
    return res.scalar_one_or_none()


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    res = await db.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    username: str,
    password: str,
    role: UserRole | str,
    display_name: str,
) -> User:
    user = User(
        username=username.lower(),
        password_hash=hash_password(password),
        role=UserRole(role) if isinstance(role, str) else role,
        display_name=display_name.strip(),
    )
    db.add(user)
    await db.flush()
    return user
