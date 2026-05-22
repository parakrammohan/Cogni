"""user photo_url

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-22

Adds a `photo_url` TEXT column to the `users` table so both caregivers
and patients can store their own avatar (data URL or remote URL). The
TopBar avatar reads this for every authenticated user; before this
column existed, caregivers had no way to set an avatar at all and the
TopBar fell back to a colored initials tile.

The existing `profiles.photo_url` column is unchanged — that's the
PATIENT'S medical-profile photo used by the patient Home + caregiver
Manage scenes, and may be set by either side of the pairing. Keeping
them separate lets a caregiver set their own avatar without overwriting
the patient profile photo.

Default `""` so existing rows match the model's `nullable=False, default=""`
shape; column itself stays nullable=False to avoid Optional<>-everywhere
on the read path.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_url", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_url")
