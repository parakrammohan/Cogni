"""Password hashing (Argon2id) + JWT (HS256).

Argon2id is OWASP's currently-recommended password hash: memory-hard,
GPU/ASIC-resistant. The `argon2.PasswordHasher()` defaults (time_cost=3,
memory_cost=64 MiB, parallelism=4) exceed the OWASP 2024 minimum.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

_settings = get_settings()
_hasher = PasswordHasher()

JWT_ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        _hasher.verify(hashed, plain)
        return True
    except VerifyMismatchError:
        return False
    except Exception:  # malformed hash, etc.
        return False


def needs_rehash(hashed: str) -> bool:
    """Argon2 parameters drift over time; use this to opportunistically
    upgrade hashes on successful login."""
    return _hasher.check_needs_rehash(hashed)


def create_access_token(user_id: uuid.UUID | str, role: str) -> tuple[str, int]:
    """Returns (token, expires_in_seconds)."""
    now = datetime.now(timezone.utc)
    expires_in = _settings.jwt_ttl_seconds
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
    }
    token = jwt.encode(payload, _settings.jwt_secret, algorithm=JWT_ALGORITHM)
    return token, expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises `jwt.PyJWTError` on any failure (expired, malformed, bad sig)."""
    return jwt.decode(token, _settings.jwt_secret, algorithms=[JWT_ALGORITHM])


# Tiny helper for tests / scripts.
def _now_ts() -> int:
    return int(time.time())
