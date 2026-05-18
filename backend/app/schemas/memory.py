from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    caption: str
    context: str
    photo_url: str
    created_at: datetime
    updated_at: datetime


class MemoryCreate(BaseModel):
    caption: str = Field(default="", max_length=240)
    context: str = Field(default="", max_length=120)
    photo_url: str = Field(default="")


class MemoryPatch(BaseModel):
    caption: str | None = Field(default=None, max_length=240)
    context: str | None = Field(default=None, max_length=120)
    photo_url: str | None = None
