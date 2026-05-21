from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.security_pii import EncryptedText


class Profile(Base):
    """One Profile per patient (1-to-1).

    PII columns (full_name, preferred_name, allergies, medical_notes,
    home_address) are stored as Fernet-encrypted BYTEA via
    `EncryptedText` and decrypted on read. `blood_type`, `birth_date`
    and `photo_url` are not encrypted: `blood_type` is low sensitivity
    on its own, `birth_date` would lose date-arithmetic capability, and
    `photo_url` is already either a public CDN URL or a base64 data URL
    that we'd have to fully decrypt to render anyway.
    """

    __tablename__ = "profiles"

    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    full_name: Mapped[str] = mapped_column(EncryptedText, default="", nullable=False)
    preferred_name: Mapped[str] = mapped_column(EncryptedText, default="", nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_type: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    allergies: Mapped[str] = mapped_column(EncryptedText, default="", nullable=False)
    medical_notes: Mapped[str] = mapped_column(EncryptedText, default="", nullable=False)
    home_address: Mapped[str] = mapped_column(EncryptedText, default="", nullable=False)
    photo_url: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Caregiver lock — when true, the patient cannot self-edit their
    # profile (the patient-side Edit Details form is disabled). Only
    # the paired caregiver can toggle this flag via the Manage scene.
    caregiver_locked: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
