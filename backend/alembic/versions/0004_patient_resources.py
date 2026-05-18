"""create profiles, contacts, reminders, memories

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("full_name", sa.String(length=120), server_default="", nullable=False),
        sa.Column("preferred_name", sa.String(length=120), server_default="", nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("blood_type", sa.String(length=8), server_default="", nullable=False),
        sa.Column("allergies", sa.Text(), server_default="", nullable=False),
        sa.Column("medical_notes", sa.Text(), server_default="", nullable=False),
        sa.Column("home_address", sa.Text(), server_default="", nullable=False),
        sa.Column("photo_url", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "contacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("relationship", sa.String(length=120), server_default="", nullable=False),
        sa.Column("phone", sa.String(length=64), server_default="", nullable=False),
        sa.Column("photo_url", sa.Text(), server_default="", nullable=False),
        sa.Column("is_emergency", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_contacts_patient_id", "contacts", ["patient_id"])

    op.create_table(
        "reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column("time_of_day", sa.String(length=5), server_default="", nullable=False),
        sa.Column("recurring", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_reminders_patient_id", "reminders", ["patient_id"])

    op.create_table(
        "memories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("caption", sa.String(length=240), server_default="", nullable=False),
        sa.Column("context", sa.String(length=120), server_default="", nullable=False),
        sa.Column("photo_url", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_memories_patient_id", "memories", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_memories_patient_id", table_name="memories")
    op.drop_table("memories")
    op.drop_index("ix_reminders_patient_id", table_name="reminders")
    op.drop_table("reminders")
    op.drop_index("ix_contacts_patient_id", table_name="contacts")
    op.drop_table("contacts")
    op.drop_table("profiles")
