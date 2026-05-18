from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class GameStatus(str, enum.Enum):
    checkpoint = "checkpoint"
    final = "final"


class GameSession(Base):
    """A completed cognition session — the rolling history that drives
    the caregiver Trends scene + the decline-detection orchestrator."""

    __tablename__ = "game_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    game: Mapped[str] = mapped_column(String(60), nullable=False)  # "sequence", "simon", …
    memory_span: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_reaction: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mistakes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[GameStatus] = mapped_column(
        Enum(GameStatus, name="game_status", native_enum=True),
        default=GameStatus.final,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
