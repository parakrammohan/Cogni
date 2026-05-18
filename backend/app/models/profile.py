from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Profile(Base):
    """One Profile per patient (1-to-1). PII columns are plain text
    today; app-layer Fernet column encryption is a documented
    follow-up (see docs/security.md)."""

    __tablename__ = "profiles"

    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    full_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    preferred_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_type: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    allergies: Mapped[str] = mapped_column(Text, default="", nullable=False)
    medical_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    home_address: Mapped[str] = mapped_column(Text, default="", nullable=False)
    photo_url: Mapped[str] = mapped_column(Text, default="", nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
