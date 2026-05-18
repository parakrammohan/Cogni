from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reminder import Reminder


async def list_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> list[Reminder]:
    res = await db.execute(
        select(Reminder)
        .where(Reminder.patient_id == patient_id)
        .order_by(Reminder.time_of_day, Reminder.created_at)
    )
    return list(res.scalars().all())


async def get(db: AsyncSession, reminder_id: uuid.UUID) -> Reminder | None:
    res = await db.execute(select(Reminder).where(Reminder.id == reminder_id))
    return res.scalar_one_or_none()


async def create(db: AsyncSession, patient_id: uuid.UUID, fields: dict) -> Reminder:
    row = Reminder(patient_id=patient_id, **fields)
    db.add(row)
    await db.flush()
    return row


async def update(db: AsyncSession, row: Reminder, fields: dict) -> Reminder:
    for key, value in fields.items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    return row


async def toggle_complete(db: AsyncSession, row: Reminder) -> Reminder:
    row.completed_at = None if row.completed_at else datetime.now(timezone.utc)
    await db.flush()
    return row


async def delete_by_id(db: AsyncSession, reminder_id: uuid.UUID) -> int:
    res = await db.execute(delete(Reminder).where(Reminder.id == reminder_id))
    return res.rowcount or 0
