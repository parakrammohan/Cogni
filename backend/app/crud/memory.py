from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory import Memory


async def list_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> list[Memory]:
    res = await db.execute(
        select(Memory)
        .where(Memory.patient_id == patient_id)
        .order_by(Memory.created_at.desc())
    )
    return list(res.scalars().all())


async def get(db: AsyncSession, memory_id: uuid.UUID) -> Memory | None:
    res = await db.execute(select(Memory).where(Memory.id == memory_id))
    return res.scalar_one_or_none()


async def create(db: AsyncSession, patient_id: uuid.UUID, fields: dict) -> Memory:
    row = Memory(patient_id=patient_id, **fields)
    db.add(row)
    await db.flush()
    return row


async def update(db: AsyncSession, row: Memory, fields: dict) -> Memory:
    for key, value in fields.items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    return row


async def delete_by_id(db: AsyncSession, memory_id: uuid.UUID) -> int:
    res = await db.execute(delete(Memory).where(Memory.id == memory_id))
    return res.rowcount or 0
