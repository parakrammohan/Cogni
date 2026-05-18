from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact


async def list_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> list[Contact]:
    res = await db.execute(
        select(Contact)
        .where(Contact.patient_id == patient_id)
        .order_by(Contact.is_emergency.desc(), Contact.sort_order, Contact.created_at)
    )
    return list(res.scalars().all())


async def get(db: AsyncSession, contact_id: uuid.UUID) -> Contact | None:
    res = await db.execute(select(Contact).where(Contact.id == contact_id))
    return res.scalar_one_or_none()


async def create(db: AsyncSession, patient_id: uuid.UUID, fields: dict) -> Contact:
    row = Contact(patient_id=patient_id, **fields)
    db.add(row)
    await db.flush()
    return row


async def update(db: AsyncSession, row: Contact, fields: dict) -> Contact:
    for key, value in fields.items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    return row


async def delete_by_id(db: AsyncSession, contact_id: uuid.UUID) -> int:
    res = await db.execute(delete(Contact).where(Contact.id == contact_id))
    return res.rowcount or 0
