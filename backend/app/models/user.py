from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UserRole(str, enum.Enum):
    caregiver = "caregiver"
    patient = "patient"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Stored lowercased to make lookups case-insensitive without needing
    # the citext extension on every Postgres install.
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=True),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Avatar shown in the TopBar dropdown + sidebar identity tile for
    # both roles. May be a data URL (user-uploaded JPEG/PNG) or a remote
    # URL. Empty string means "fall back to colored-initials tile".
    photo_url: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
