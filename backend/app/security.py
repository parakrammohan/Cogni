"""Password hashing (Argon2id) + session-token generation.

Sessions are opaque random tokens — the token is just a pointer into
the `sessions` table. The raw token never goes to disk; we store its
SHA-256 hash. A DB leak therefore can't replay live sessions.

No JWT, no JWT_SECRET. Logout / revocation = DELETE FROM sessions.
"""

from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


# -------- passwords --------

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


def password_needs_rehash(hashed: str) -> bool:
    """Argon2 parameters drift over time; opportunistically rehash
    on successful login."""
    return _hasher.check_needs_rehash(hashed)


# -------- session tokens --------

SESSION_TOKEN_BYTES = 32  # 256 bits


def generate_session_token() -> tuple[str, bytes]:
    """Generate (raw_token, sha256_hash_bytes).

    The raw token goes in the Set-Cookie header. The hash goes in the
    DB. On subsequent requests we hash the incoming cookie value and
    look up by hash."""
    raw = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    digest = hashlib.sha256(raw.encode("ascii")).digest()
    return raw, digest


def hash_session_token(raw: str) -> bytes:
    return hashlib.sha256(raw.encode("ascii")).digest()
