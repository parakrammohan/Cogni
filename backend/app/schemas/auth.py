from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["caregiver", "patient"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    role: Role
    display_name: str


class SignupIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    display_name: str = Field(min_length=1, max_length=120)
    # Patient-only — when present, the new account is paired immediately
    # with the caregiver who owns this code. Stage 2 wires this up.
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


class TokenOut(BaseModel):
    user: UserOut
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
