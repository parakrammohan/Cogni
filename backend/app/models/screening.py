from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ScreeningModel(str, enum.Enum):
    alzheimer_tabular = "alzheimer_tabular"
    dementia_oasis = "dementia_oasis"
    adresso_agitation = "adresso_agitation"
    alzheimer_mri = "alzheimer_mri"


class ScreeningBand(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    high = "high"


class ScreeningResult(Base):
    """One row per screening-model invocation. Persists the feature
    vector + raw probabilities so the caregiver Screening page can
    show history without re-running inference."""

    __tablename__ = "screening_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model: Mapped[ScreeningModel] = mapped_column(
        Enum(ScreeningModel, name="screening_model", native_enum=True),
        nullable=False,
        index=True,
    )
    inputs_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    probability: Mapped[float] = mapped_column(Float, nullable=False)
    band: Mapped[ScreeningBand] = mapped_column(
        Enum(ScreeningBand, name="screening_band", native_enum=True),
        nullable=False,
    )
    classes_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
