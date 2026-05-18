from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    name: str
    relationship: str
    phone: str
    photo_url: str
    is_emergency: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    relationship: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=64)
    photo_url: str = Field(default="")
    is_emergency: bool = False
    sort_order: int = 0


class ContactPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    relationship: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=64)
    photo_url: str | None = None
    is_emergency: bool | None = None
    sort_order: int | None = None
