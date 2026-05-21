from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile


async def get_or_create(db: AsyncSession, patient_id: uuid.UUID) -> Profile:
    res = await db.execute(select(Profile).where(Profile.patient_id == patient_id))
    row = res.scalar_one_or_none()
    if row is not None:
        return row
    row = Profile(patient_id=patient_id)
    db.add(row)
    await db.flush()
    return row


async def upsert(db: AsyncSession, patient_id: uuid.UUID, fields: dict) -> Profile:
    row = await get_or_create(db, patient_id)
    for key, value in fields.items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    # Pull server-side `updated_at` back so pydantic can serialize without
    # triggering a lazy load outside the greenlet context.
    await db.refresh(row)
    return row


async def upsert_as_patient_if_unlocked(
    db: AsyncSession, patient_id: uuid.UUID, fields: dict
) -> Profile | None:
    """Patient-side update that atomically respects `caregiver_locked`.

    Returns the updated `Profile` row, or `None` if the row is locked.
    The lock state is checked inside the same statement that holds the
    row lock — closes the TOCTOU window between "read unlocked" and
    "write fields" that would otherwise let a patient slip an edit past
    a concurrent caregiver lock toggle.
    """
    res = await db.execute(
        select(Profile).where(Profile.patient_id == patient_id).with_for_update()
    )
    row = res.scalar_one_or_none()
    if row is None:
        row = Profile(patient_id=patient_id)
        db.add(row)
        await db.flush()
    if row.caregiver_locked:
        return None
    for key, value in fields.items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return row
