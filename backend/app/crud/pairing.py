from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib import codes
from app.lib.errors import ConflictError, NotFoundError, ValidationError_
from app.models.pairing import InviteCode, Pairing
from app.models.user import User, UserRole

INVITE_TTL = timedelta(hours=24)


async def create_invite(db: AsyncSession, *, caregiver: User) -> InviteCode:
    if caregiver.role != UserRole.caregiver:
        raise ValidationError_("Only caregivers can create invite codes.")
    # 5 attempts max — collision space is huge, so this is paranoia.
    for _ in range(5):
        invite = InviteCode(
            caregiver_id=caregiver.id,
            code=codes.generate(),
            expires_at=datetime.now(timezone.utc) + INVITE_TTL,
        )
        db.add(invite)
        try:
            await db.flush()
            return invite
        except IntegrityError:
            await db.rollback()
    raise ConflictError("Couldn't allocate an invite code after several tries.")


async def get_active_invite(db: AsyncSession, code: str) -> InviteCode | None:
    """Returns the row only if it's unredeemed AND unexpired."""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(InviteCode).where(
            InviteCode.code == code.strip().upper(),
            InviteCode.redeemed_by.is_(None),
            InviteCode.expires_at > now,
        )
    )
    return res.scalar_one_or_none()


async def redeem(db: AsyncSession, *, code: str, patient: User) -> Pairing:
    """Validate the code, create a Pairing, mark the code as redeemed.

    Raises NotFoundError if code is unknown, expired, or already used.
    Raises ConflictError if the patient is already paired with someone.
    """
    if patient.role != UserRole.patient:
        raise ValidationError_("Only patient accounts can redeem invite codes.")

    existing = await get_pairing_for_patient(db, patient.id)
    if existing is not None:
        raise ConflictError("This patient account is already paired.")

    invite = await get_active_invite(db, code)
    if invite is None:
        raise NotFoundError("Invite code is invalid, expired, or already used.")

    pairing = Pairing(caregiver_id=invite.caregiver_id, patient_id=patient.id)
    invite.redeemed_by = patient.id
    invite.redeemed_at = datetime.now(timezone.utc)
    db.add(pairing)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Pairing already exists.")
    return pairing


async def get_pairing_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> Pairing | None:
    res = await db.execute(select(Pairing).where(Pairing.patient_id == patient_id))
    return res.scalar_one_or_none()


async def list_pairings_for_caregiver(db: AsyncSession, caregiver_id: uuid.UUID) -> list[Pairing]:
    res = await db.execute(
        select(Pairing).where(Pairing.caregiver_id == caregiver_id).order_by(Pairing.established_at)
    )
    return list(res.scalars().all())


async def break_pairing(db: AsyncSession, *, user: User, patient_id: uuid.UUID) -> bool:
    """Either the patient OR the caregiver can break their pairing.
    Returns True if a row was deleted."""
    pairing = await get_pairing_for_patient(db, patient_id)
    if pairing is None:
        return False
    if user.id not in (pairing.caregiver_id, pairing.patient_id):
        raise NotFoundError("Pairing not found.")
    await db.execute(delete(Pairing).where(Pairing.id == pairing.id))
    return True
