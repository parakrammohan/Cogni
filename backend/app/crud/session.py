from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import Session
from app.models.user import User
from app.security import generate_session_token, hash_session_token


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    ttl_seconds: int,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[str, Session]:
    """Insert a new session. Returns (raw_token_to_send_in_cookie, row)."""
    raw, digest = generate_session_token()
    now = datetime.now(timezone.utc)
    sess = Session(
        token_hash=digest,
        user_id=user_id,
        created_at=now,
        last_used_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds),
        user_agent=(user_agent or "")[:512] or None,
        ip_address=(ip_address or "")[:64] or None,
    )
    db.add(sess)
    await db.flush()
    return raw, sess


async def get_active_with_user(db: AsyncSession, raw_token: str) -> tuple[Session, User] | None:
    """Looks up a non-expired session by its raw token, joined with the user."""
    digest = hash_session_token(raw_token)
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(Session, User)
        .join(User, User.id == Session.user_id)
        .where(Session.token_hash == digest, Session.expires_at > now)
    )
    row = res.first()
    if row is None:
        return None
    return row[0], row[1]


# Don't UPDATE last_used_at more often than this. The previous behaviour
# wrote on every authenticated request — including pure GETs and 1 Hz
# WebSocket-derived REST polls — which generated lock contention on the
# `sessions` PK (token_hash) under any concurrency. A minute of resolution
# is plenty for an "active devices" UI.
_TOUCH_MIN_INTERVAL = timedelta(seconds=60)


async def touch(db: AsyncSession, sess: Session) -> None:
    """Bump last_used_at, but at most once per minute per session row."""
    now = datetime.now(timezone.utc)
    if sess.last_used_at is not None and (now - sess.last_used_at) < _TOUCH_MIN_INTERVAL:
        return
    sess.last_used_at = now
    await db.flush()


async def delete_by_token(db: AsyncSession, raw_token: str) -> int:
    digest = hash_session_token(raw_token)
    res = await db.execute(delete(Session).where(Session.token_hash == digest))
    return res.rowcount or 0


async def delete_for_user(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Sign-out-everywhere."""
    res = await db.execute(delete(Session).where(Session.user_id == user_id))
    return res.rowcount or 0


async def purge_expired(db: AsyncSession) -> int:
    """Housekeeping — call from a periodic task or on demand."""
    now = datetime.now(timezone.utc)
    res = await db.execute(delete(Session).where(Session.expires_at <= now))
    return res.rowcount or 0
