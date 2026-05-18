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
    return row
