"""Encrypt PII columns at rest with Fernet.

Migrates 5 profile columns (full_name, preferred_name, allergies,
medical_notes, home_address) and 2 contact columns (name, phone) from
plain TEXT/STRING to Fernet-encrypted BYTEA. Existing rows are
encrypted in place using `FERNET_KEY` from the environment.

Per column:
  1. ADD <col>_enc BYTEA NULL
  2. UPDATE: encrypt(<col>) -> <col>_enc, for every row
  3. DROP <col>
  4. RENAME <col>_enc -> <col>, SET NOT NULL

If `FERNET_KEY` is unset, the migration aborts with a clear error
rather than silently leaving plaintext. Generate one with:
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Downgrade decrypts back to plaintext — also requires `FERNET_KEY`.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-21
"""

from __future__ import annotations

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from cryptography.fernet import Fernet

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PROFILE_COLS = ("full_name", "preferred_name", "allergies", "medical_notes", "home_address")
CONTACT_COLS = ("name", "phone")


def _fernet_from_env() -> Fernet:
    key = os.environ.get("FERNET_KEY")
    if not key:
        raise SystemExit(
            "FERNET_KEY env var is required for this migration. Generate "
            "one with: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\" and set it as an HF "
            "Space secret BEFORE deploying."
        )
    return Fernet(key.encode("utf-8"))


def _migrate_table(table: str, cols: Sequence[str], encrypt: bool, fernet: Fernet) -> None:
    """One direction of the round-trip for a single table.

    `encrypt=True`  : plaintext -> ciphertext (upgrade path)
    `encrypt=False` : ciphertext -> plaintext (downgrade path)
    """
    suffix = "_enc" if encrypt else "_pt"
    new_type = sa.LargeBinary() if encrypt else sa.Text()

    # 1. Add temp columns.
    for col in cols:
        op.add_column(table, sa.Column(f"{col}{suffix}", new_type, nullable=True))

    # 2. Pull every row and convert.
    conn = op.get_bind()
    pk_col = "patient_id" if table == "profiles" else "id"
    select_cols = ", ".join([pk_col, *cols])
    rows = conn.execute(sa.text(f"SELECT {select_cols} FROM {table}")).fetchall()
    set_clause = ", ".join(f"{c}{suffix} = :{c}" for c in cols)
    sql = sa.text(f"UPDATE {table} SET {set_clause} WHERE {pk_col} = :pk")
    for row in rows:
        params: dict[str, object] = {"pk": getattr(row, pk_col)}
        for col in cols:
            raw = getattr(row, col)
            if encrypt:
                params[col] = fernet.encrypt((raw or "").encode("utf-8"))
            else:
                # raw is bytes (or memoryview); decrypt to str
                if raw is None:
                    params[col] = ""
                else:
                    params[col] = fernet.decrypt(bytes(raw)).decode("utf-8")
        conn.execute(sql, params)

    # 3. Drop original columns.
    for col in cols:
        op.drop_column(table, col)

    # 4. Rename temp -> original + tighten to NOT NULL.
    for col in cols:
        op.alter_column(table, f"{col}{suffix}", new_column_name=col, nullable=False)


def upgrade() -> None:
    fernet = _fernet_from_env()
    _migrate_table("profiles", PROFILE_COLS, encrypt=True, fernet=fernet)
    _migrate_table("contacts", CONTACT_COLS, encrypt=True, fernet=fernet)


def downgrade() -> None:
    fernet = _fernet_from_env()
    _migrate_table("profiles", PROFILE_COLS, encrypt=False, fernet=fernet)
    _migrate_table("contacts", CONTACT_COLS, encrypt=False, fernet=fernet)
