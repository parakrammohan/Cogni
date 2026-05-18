from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: uuid.UUID
    full_name: str
    preferred_name: str
    birth_date: date | None
    blood_type: str
    allergies: str
    medical_notes: str
    home_address: str
    photo_url: str
    updated_at: datetime


class ProfileIn(BaseModel):
    """Partial update — every field is optional. Used for both PUT
    (upsert) and PATCH semantics; backend treats it as upsert."""

    full_name: str | None = Field(default=None, max_length=120)
    preferred_name: str | None = Field(default=None, max_length=120)
    birth_date: date | None = None
    blood_type: str | None = Field(default=None, max_length=8)
    allergies: str | None = None
    medical_notes: str | None = None
    home_address: str | None = None
    photo_url: str | None = None
