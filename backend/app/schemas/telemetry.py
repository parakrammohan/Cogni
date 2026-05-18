from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ----- Game sessions ---------------------------------------------------------

GameStatusLit = Literal["checkpoint", "final"]


class GameSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    game: str
    memory_span: int
    avg_reaction: int
    mistakes: int
    score: float
    status: GameStatusLit
    created_at: datetime


class GameSessionCreate(BaseModel):
    game: str = Field(min_length=1, max_length=60)
    memory_span: int = 0
    avg_reaction: int = 0
    mistakes: int = 0
    score: float = 0.0
    status: GameStatusLit = "final"


# ----- Pursuit results -------------------------------------------------------

PursuitRiskLit = Literal["low", "moderate", "high"]


class PursuitResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    gain: float
    accuracy: float
    saccade_rate: float
    latency_ms: float
    risk: PursuitRiskLit
    created_at: datetime


class PursuitResultCreate(BaseModel):
    gain: float
    accuracy: float
    saccade_rate: float
    latency_ms: float
    risk: PursuitRiskLit
