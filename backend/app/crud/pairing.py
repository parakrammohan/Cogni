from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib import codes
from app.lib.errors import ConflictError, NotFoundError, ValidationError_
from app.models.pairing import InviteCode, Pairing
from app.models.user import User, UserRole

# Pairing security: short TTL + single-active-code-per-inviter shrinks
# the brute-force window from days to minutes. Combined with the
# in-process redeem rate limit (see crud_pair_security), guessing a code
# is statistically negligible.
INVITE_TTL = timedelta(minutes=15)


async def create_invite(db: AsyncSession, *, inviter: User) -> InviteCode:
    """Pairing is symmetric: either role may generate a code. The
    redeemer must be of the opposite role — that's validated in
    `redeem()`. The `caregiver_id` column on invite_codes stores the
    inviter's user id regardless of role (named that way for legacy
    reasons; future migration can rename to `inviter_id`).

    Generating a new code invalidates any prior unredeemed codes from
    the same inviter — there's at most one live code per inviter at a
    time. Combined with the 15-minute TTL this caps the brute-force
    surface dramatically.
    """
    now = datetime.now(timezone.utc)
    # Expire any unredeemed previous codes by this inviter.
    await db.execute(
        update(InviteCode)
        .where(
            InviteCode.caregiver_id == inviter.id,
            InviteCode.redeemed_by.is_(None),
            InviteCode.expires_at > now,
        )
        .values(expires_at=now)
    )
    # 5 attempts max — collision space is huge, so this is paranoia.
    for _ in range(5):
        invite = InviteCode(
            caregiver_id=inviter.id,
            code=codes.generate(),
            expires_at=now + INVITE_TTL,
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


async def redeem(db: AsyncSession, *, code: str, redeemer: User) -> Pairing:
    """Validate the code, create a Pairing, mark the code as redeemed.

    Either role may redeem — but the inviter and redeemer must be of
    opposite roles (caregiver↔patient). The resulting Pairing always
    has the caregiver on the caregiver_id side and the patient on the
    patient_id side regardless of who generated the code.

    Single-use enforcement is at the DB layer: we mark the invite as
    redeemed with an atomic conditional UPDATE — only one concurrent
    caller can claim a given invite. A plain `SELECT … WHERE redeemed_by
    IS NULL` followed by an in-memory `invite.redeemed_by = ...` would
    let N callers race the same code (only `pairings.patient_id` UNIQUE
    catches duplicates, and that doesn't fire when two distinct patients
    redeem one caregiver-issued code).

    Raises NotFoundError if the code is unknown, expired, or already used.
    Raises ConflictError if the patient side is already paired.
    """
    invite = await get_active_invite(db, code)
    if invite is None:
        raise NotFoundError("Invite code is invalid, expired, or already used.")

    inviter = (
        await db.execute(select(User).where(User.id == invite.caregiver_id))
    ).scalar_one_or_none()
    if inviter is None:
        raise NotFoundError("Inviter no longer exists.")
    if inviter.id == redeemer.id:
        raise ValidationError_("You can't redeem your own invite code.")
    if inviter.role == redeemer.role:
        raise ValidationError_(
            "Pairing must be between a caregiver and a patient — both sides have the same role."
        )

    if inviter.role == UserRole.caregiver:
        caregiver_id = inviter.id
        patient_id = redeemer.id
    else:
        caregiver_id = redeemer.id
        patient_id = inviter.id

    # Post-0008: caregivers are single-patient, patients can have many
    # caregivers. The "already paired" guard moves to the caregiver side.
    # A patient may keep redeeming codes to add more caregivers; the
    # composite (caregiver_id, patient_id) doesn't need extra dedup
    # because UNIQUE(caregiver_id) blocks the same caregiver row appearing
    # twice.
    existing = await get_pairing_for_caregiver(db, caregiver_id)
    if existing is not None:
        if existing.patient_id == patient_id:
            raise ConflictError("This caregiver is already paired with this patient.")
        raise ConflictError("This caregiver is already paired with another patient.")

    # Atomic claim: only proceed if THIS caller is the one who flipped
    # the invite from unredeemed → redeemed. Any concurrent racer hits
    # rowcount==0 and exits with NotFoundError.
    now = datetime.now(timezone.utc)
    claim = await db.execute(
        update(InviteCode)
        .where(
            InviteCode.id == invite.id,
            InviteCode.redeemed_by.is_(None),
            InviteCode.expires_at > now,
        )
        .values(redeemed_by=redeemer.id, redeemed_at=now)
    )
    if (claim.rowcount or 0) != 1:
        raise NotFoundError("Invite code is invalid, expired, or already used.")

    pairing = Pairing(caregiver_id=caregiver_id, patient_id=patient_id)
    db.add(pairing)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Pairing already exists.")
    return pairing


async def list_pairings_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> list[Pairing]:
    """Return every caregiver paired with this patient. Post-0008 a patient
    may have multiple caregivers; the list is sorted by established_at so
    the longest-running pairing renders first in the UI."""
    res = await db.execute(
        select(Pairing).where(Pairing.patient_id == patient_id).order_by(Pairing.established_at)
    )
    return list(res.scalars().all())


async def get_pairing_for_caregiver(db: AsyncSession, caregiver_id: uuid.UUID) -> Pairing | None:
    """Caregivers are single-patient (UNIQUE on caregiver_id) so this
    returns at most one row."""
    res = await db.execute(select(Pairing).where(Pairing.caregiver_id == caregiver_id))
    return res.scalar_one_or_none()


async def list_pairings_for_caregiver(db: AsyncSession, caregiver_id: uuid.UUID) -> list[Pairing]:
    """Kept for the WS topic-resolution path that wants a list (always
    0 or 1 entries post-0008). Same semantics as `get_pairing_for_caregiver`
    but in list form."""
    res = await db.execute(
        select(Pairing).where(Pairing.caregiver_id == caregiver_id).order_by(Pairing.established_at)
    )
    return list(res.scalars().all())


async def break_pairing(
    db: AsyncSession,
    *,
    user: User,
    caregiver_id: uuid.UUID,
    patient_id: uuid.UUID,
) -> bool:
    """Delete a specific (caregiver, patient) pairing. Either side of the
    bond may break it; the caller must identify exactly which row to drop
    (a patient with multiple caregivers needs to specify which one to
    remove). Returns True if a row was deleted.

    Also tears down the caregiver's in-flight WebSocket subscription on
    that patient's topic so the live feed stops immediately instead of
    leaking patient state until the socket dies naturally.
    """
    res = await db.execute(
        select(Pairing).where(
            Pairing.caregiver_id == caregiver_id, Pairing.patient_id == patient_id
        )
    )
    pairing = res.scalar_one_or_none()
    if pairing is None:
        return False
    if user.id not in (pairing.caregiver_id, pairing.patient_id):
        raise NotFoundError("Pairing not found.")
    caregiver_id = pairing.caregiver_id
    await db.execute(delete(Pairing).where(Pairing.id == pairing.id))
    # Best-effort live-feed eviction. Imported lazily to avoid a hard
    # circular: ws_hub doesn't depend on crud, and crud only depends on
    # ws_hub here.
    try:
        from app.ws_hub import hub
        await hub.evict_user_from_topic(str(caregiver_id), f"patient:{patient_id}")
    except Exception:
        pass
    return True
