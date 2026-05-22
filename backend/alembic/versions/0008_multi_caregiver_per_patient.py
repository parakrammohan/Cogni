"""multi-caregiver per patient

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-22

Flip the pairing cardinality:

  Was:  one patient -> ONE caregiver           (UNIQUE pairings.patient_id)
        one caregiver -> N patients            (no UNIQUE on caregiver_id)

  Now:  one patient -> N caregivers            (no UNIQUE on patient_id)
        one caregiver -> ONE patient           (UNIQUE pairings.caregiver_id)

The patient still has a single inbound monitoring stream, but it fans out
to every paired caregiver. A caregiver remains dedicated to exactly one
patient, which matches the demo flow + keeps the redeem race + the WS
topic subscription set bounded.

Migration safety note: if any caregiver in the existing data already has
more than one paired patient, adding UNIQUE(caregiver_id) will fail. We
add the constraint as-is — production currently has one demo caregiver
with one demo patient, so this is safe in the live state. If a future
operator hits the constraint, they can drop the duplicate rows manually
before re-running.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Patient is no longer unique — many caregivers can pair to the same patient.
    op.drop_constraint("uq_pairings_patient_id", "pairings", type_="unique")
    # We still want fast lookups by patient_id (caregiver-side WS topic
    # resolution, `list_pairings_for_patient`). The old unique constraint
    # was implicitly indexing it; add an explicit index now.
    op.create_index("ix_pairings_patient_id", "pairings", ["patient_id"])
    # Caregiver becomes single-patient. One row per caregiver.
    op.create_unique_constraint(
        "uq_pairings_caregiver_id", "pairings", ["caregiver_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_pairings_caregiver_id", "pairings", type_="unique")
    op.drop_index("ix_pairings_patient_id", table_name="pairings")
    op.create_unique_constraint(
        "uq_pairings_patient_id", "pairings", ["patient_id"]
    )
