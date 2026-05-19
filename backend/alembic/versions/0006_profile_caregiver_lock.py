"""Add profiles.caregiver_locked flag.

Lets a caregiver lock the patient out of self-editing their care
record after pairing. Defaults to false so existing rows keep current
behaviour.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "caregiver_locked",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "caregiver_locked")
