"""Fernet-based PII column encryption.

Provides an `EncryptedText` SQLAlchemy `TypeDecorator` that transparently
encrypts Python strings on the way in and decrypts on the way out, while
storing ciphertext as `BYTEA` in Postgres. Columns using it look like
normal `str` columns to the rest of the app.

Threat model
============
- **In scope**: accidental DB dumps, backup tapes, snapshot exfiltration,
  any read-only DB access leak. Without the key, those rows are
  unreadable.
- **Out of scope**: a compromised app server. The server has the key in
  `FERNET_KEY` and uses it to decrypt on every read, so anyone with
  process access can decrypt too.

Operationally
=============
Set `FERNET_KEY` once in HF Space Secrets. Rotation requires re-encrypting
every existing row with the new key (not implemented; treat the key as
permanent). Generate with::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.engine import Dialect
from sqlalchemy.types import LargeBinary, TypeDecorator

from app.config import get_settings

log = logging.getLogger("cogni.security_pii")


class FernetKeyMissing(RuntimeError):
    """Raised when an encrypted column is read or written but FERNET_KEY
    is not configured. Better to crash loudly than to silently store
    plaintext or return garbage."""


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = get_settings().fernet_key
    if not key:
        raise FernetKeyMissing(
            "FERNET_KEY is not set. PII columns cannot be read or written. "
            "Generate one with: python -c 'from cryptography.fernet import "
            "Fernet; print(Fernet.generate_key().decode())' and add it to "
            "HF Space → Settings → Variables and Secrets."
        )
    return Fernet(key.encode("utf-8") if isinstance(key, str) else key)


def encrypt_str(value: str) -> bytes:
    """Imperative helper for the Alembic migration that doesn't hold an
    ORM session. Returns the Fernet ciphertext for a single string."""
    return _fernet().encrypt(value.encode("utf-8"))


def decrypt_to_str(value: bytes) -> str:
    """Inverse of `encrypt_str`. Returns empty string on bad tokens so
    a stray garbage row doesn't take the whole API response down."""
    if value is None:
        return ""
    try:
        return _fernet().decrypt(bytes(value)).decode("utf-8")
    except InvalidToken:
        log.warning("Encountered invalid Fernet token; returning empty string.")
        return ""


class EncryptedText(TypeDecorator):
    """`TypeDecorator` that presents as Python `str` and stores BYTEA.

    - `None` round-trips as `None` (so nullable columns still work).
    - Non-string Python values are coerced via `str()` before encrypt.
    - On read, an invalid / wrong-key ciphertext returns "" rather than
      raising, so one corrupted row can't 500 a list endpoint.
    """

    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, _dialect: Dialect):  # type: ignore[override]
        if value is None:
            return None
        if not isinstance(value, str):
            # Previously coerced via `str()`, which silently encrypted
            # `repr(obj)` if a caller accidentally passed a list, dict, or
            # ORM object. That made data corruption invisible — the round-
            # trip just returned the repr. Refuse non-str values loudly.
            raise TypeError(
                f"EncryptedText only accepts str values, got {type(value).__name__}"
            )
        return _fernet().encrypt(value.encode("utf-8"))

    def process_result_value(self, value, _dialect: Dialect):  # type: ignore[override]
        if value is None:
            return None
        try:
            return _fernet().decrypt(bytes(value)).decode("utf-8")
        except InvalidToken:
            # ERROR (not warning) so silent ciphertext corruption is
            # detectable in the admin log feed instead of being lost
            # in the background. We still return "" so a single
            # corrupted row doesn't 500 every list endpoint.
            log.error("Invalid Fernet token in column read — returning empty string.")
            return ""
