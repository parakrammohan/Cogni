from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    label: str
    notes: str
    time_of_day: str
    recurring: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReminderCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    notes: str = Field(default="")
    time_of_day: str = Field(default="", max_length=5)
    recurring: bool = True


class ReminderPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = None
    time_of_day: str | None = Field(default=None, max_length=5)
    recurring: bool | None = None
