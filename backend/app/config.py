"""Process-wide settings, loaded from environment variables at startup.

All secrets live in environment variables — never hardcoded. On Hugging
Face Spaces these come from Settings → Variables and Secrets.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_asyncpg_url(url: str) -> str:
    """Coerce a libpq-style Postgres URL into one SQLAlchemy + asyncpg accepts.

    Aiven hands out URLs like
        postgres://user:pw@host:port/db?sslmode=require
    which neither the asyncpg dialect prefix nor the asyncpg SSL keyword
    matches. We rewrite both so the same DATABASE_URL works whether it
    came from Aiven, Render, or our own .env.
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    for mode in ("require", "verify-ca", "verify-full", "disable", "allow", "prefer"):
        url = url.replace(f"?sslmode={mode}", f"?ssl={mode}")
        url = url.replace(f"&sslmode={mode}", f"&ssl={mode}")
    return url


def describe_db_url(url: str) -> dict[str, str | int | None]:
    """Returns the public parts of a Postgres URL for safe logging.
    Never includes the password."""
    if not url:
        return {"set": False}
    try:
        p = urlparse(url)
        return {
            "set": True,
            "scheme": p.scheme,
            "user": p.username,
            "host": p.hostname,
            "port": p.port,
            "db": (p.path or "").lstrip("/") or None,
        }
    except Exception as exc:  # pragma: no cover — defensive
        return {"set": True, "parse_error": repr(exc)}


SameSite = Literal["lax", "strict", "none"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    environment: str = Field(default="production", alias="ENVIRONMENT")
    log_level: str = Field(default="info", alias="LOG_LEVEL")

    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    fernet_key: str | None = Field(default=None, alias="FERNET_KEY")

    cors_allowed_origins: str = Field(
        default="https://cogni-steel.vercel.app,http://localhost:5173",
        alias="CORS_ALLOWED_ORIGINS",
    )

    # Session cookie config. Cross-origin (Vercel frontend → HF backend)
    # needs SameSite=None + Secure, which modern browsers require to come
    # together. HF and Vercel both serve over HTTPS so Secure is fine.
    session_cookie_name: str = Field(default="cogni_session", alias="SESSION_COOKIE_NAME")
    session_cookie_samesite: SameSite = Field(default="none", alias="SESSION_COOKIE_SAMESITE")
    session_cookie_secure: bool = Field(default=True, alias="SESSION_COOKIE_SECURE")
    # 7 days. Sessions slide on each request (last_used_at), but absolute
    # expiry is enforced — we DELETE rows past this.
    session_ttl_seconds: int = Field(default=60 * 60 * 24 * 7, alias="SESSION_TTL_SECONDS")

    # On startup we ensure two known accounts exist so the live deploy
    # is always reachable for demo / Playwright. Set SEED_DEMO_USERS=false
    # to disable. The password is intentionally hardcoded and matches
    # the auto-fill chips on AuthScreen — the demo accounts are a
    # *feature*, not a leaked secret. Anyone who logs in via these gets
    # a generic demo profile, not access to real users' data.
    seed_demo_users: bool = Field(default=True, alias="SEED_DEMO_USERS")
    demo_password: str = Field(default="demo-pass-1234", alias="DEMO_PASSWORD")

    # Injected by the GitHub Actions deploy step at build time so
    # /api/v1/version can report which commit is live.
    git_sha: str | None = Field(default=None, alias="GITHUB_SHA")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def database_url_async(self) -> str:
        return _normalize_asyncpg_url(self.database_url or "")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
