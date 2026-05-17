"""Process-wide settings, loaded from environment variables at startup.

All secrets live in environment variables — never hardcoded. On Hugging
Face Spaces these come from Settings → Variables and Secrets.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    environment: str = Field(default="production", alias="ENVIRONMENT")
    log_level: str = Field(default="info", alias="LOG_LEVEL")

    # Stage 1+ — kept here so the schema is stable across stages.
    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    jwt_secret: str | None = Field(default=None, alias="JWT_SECRET")
    fernet_key: str | None = Field(default=None, alias="FERNET_KEY")

    cors_allowed_origins: str = Field(
        default="https://cogni-steel.vercel.app,http://localhost:5173",
        alias="CORS_ALLOWED_ORIGINS",
    )

    # Injected by the GitHub Actions deploy step so /api/v1/version can
    # report which commit is live.
    git_sha: str | None = Field(default=None, alias="GITHUB_SHA")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
