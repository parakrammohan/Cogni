from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["caregiver", "patient"]


class UserOut(BaseModel):
    """Public user representation. Returned wherever the API surfaces
    'who am I' — login, signup, /me. No password, no internal IDs
    other than the public UUID."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    role: Role
    display_name: str
    photo_url: str = ""

    @field_validator("role", mode="before")
    @classmethod
    def _enum_to_value(cls, v: object) -> object:
        """ORM yields a `UserRole` enum here; pydantic v2's Literal check
        won't auto-coerce that to its `.value`. Unwrap it explicitly."""
        return v.value if hasattr(v, "value") else v


class SignupIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    display_name: str = Field(min_length=1, max_length=120)
    # Optional — when present, the new account is auto-paired with the
    # inviter immediately on signup (subject to the opposite-role rule).
    invite_code: str | None = Field(default=None, max_length=12)

    @field_validator("username")
    @classmethod
    def _normalize_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not v.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Username may only contain letters, digits, '-' and '_'.")
        return v


class LoginIn(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _lowercase(cls, v: str) -> str:
        return v.strip().lower()


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class MeUpdateIn(BaseModel):
    """Partial update to the signed-in user's own identity. Fields are
    all optional — only the ones present in the request body are touched.
    Username is normalised lowercase on the server and rechecked for
    uniqueness; photo_url is a free string (data URL or remote URL) with
    a generous length cap to allow data: URIs up to ~750 KiB of base64
    (a modest JPEG headshot)."""

    username: str | None = Field(default=None, min_length=3, max_length=64)
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    photo_url: str | None = Field(default=None, max_length=1_000_000)

    @field_validator("username")
    @classmethod
    def _normalize_username(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if not v.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Username may only contain letters, digits, '-' and '_'.")
        return v


class DeleteAccountIn(BaseModel):
    """Destructive: deletes the caller's user row. The username copy
    is a typed confirmation (must match the caller's current username,
    case-insensitive) — defends against accidental fat-finger deletes.
    Current password is verified separately to defend against stolen
    sessions / open laptops."""

    current_password: str = Field(min_length=1, max_length=128)
    username_confirmation: str = Field(min_length=1, max_length=64)

    @field_validator("username_confirmation")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()
