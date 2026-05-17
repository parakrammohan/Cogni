"""create pairings + invite_codes

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pairings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "caregiver_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "established_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("patient_id", name="uq_pairings_patient_id"),
    )
    op.create_index("ix_pairings_caregiver_id", "pairings", ["caregiver_id"])

    op.create_table(
        "invite_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "caregiver_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "redeemed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("code", name="uq_invite_codes_code"),
    )
    op.create_index("ix_invite_codes_caregiver_id", "invite_codes", ["caregiver_id"])
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"])


def downgrade() -> None:
    op.drop_index("ix_invite_codes_code", table_name="invite_codes")
    op.drop_index("ix_invite_codes_caregiver_id", table_name="invite_codes")
    op.drop_table("invite_codes")
    op.drop_index("ix_pairings_caregiver_id", table_name="pairings")
    op.drop_table("pairings")
