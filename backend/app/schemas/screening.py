from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


ModelLit = Literal[
    "alzheimer_tabular", "dementia_oasis", "adresso_agitation", "alzheimer_mri"
]
BandLit = Literal["low", "moderate", "high"]


class TabularRunIn(BaseModel):
    features: dict[str, Any]


class ScreeningRunOut(BaseModel):
    """Inference result + persisted-history id."""

    id: uuid.UUID
    patient_id: uuid.UUID
    model: ModelLit
    probability: float
    band: BandLit
    classes: list[str]
    probabilities: list[float] | None = None
    top: str | None = None
    confidence: float | None = None
    created_at: datetime


class ScreeningHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    model: ModelLit
    probability: float
    band: BandLit
    classes_json: dict | None
    inputs_json: dict
    created_at: datetime
