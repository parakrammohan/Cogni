from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SeverityLit = Literal["info", "warning", "danger", "good", "calm"]


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    module: str
    severity: SeverityLit
    title: str
    message: str
    dedupe_key: str | None
    dismissed: bool
    created_at: datetime


class AlertCreate(BaseModel):
    module: str = Field(min_length=1, max_length=60)
    severity: SeverityLit
    title: str = Field(min_length=1, max_length=240)
    message: str = ""
    dedupe_key: str | None = Field(default=None, max_length=120)
