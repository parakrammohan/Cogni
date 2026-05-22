"""Pairing routes — invite codes + caregiver↔patient bond."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select

from app.crud import pairing as crud_pair
from app.deps import CurrentUser, DbDep
from app.lib import rate_limit
from app.lib.errors import NotFoundError, ValidationError_
from app.models.pairing import Pairing
from app.models.user import User, UserRole
from app.schemas.pairing import (
    InviteOut,
    PairedPartner,
    PairingOut,
    PairingStatusOut,
    RedeemIn,
)

router = APIRouter(prefix="/pairing", tags=["pairing"])


async def _project_pairing(db, pairing: Pairing, *, viewer: User) -> PairingOut:
    """Resolve the OTHER side of the pairing into a PairedPartner."""
    partner_id = (
        pairing.patient_id if viewer.id == pairing.caregiver_id else pairing.caregiver_id
    )
    partner = (await db.execute(select(User).where(User.id == partner_id))).scalar_one()
    return PairingOut(
        pairing_id=pairing.id,
        established_at=pairing.established_at,
        partner=PairedPartner.model_validate({
            "id": partner.id,
            "username": partner.username,
            "display_name": partner.display_name,
            "role": partner.role.value,
        }),
    )


@router.get("/status", response_model=PairingStatusOut)
async def status_(current_user: CurrentUser, db: DbDep) -> PairingStatusOut:
    """Return every active pairing for the caller.

    Post-0008 cardinality: a caregiver has 0 or 1 patient, a patient may
    have 0..N caregivers. Both sides get a list (the caregiver list is
    just always 0-or-1 entries) so the frontend can render uniformly.
    """
    if current_user.role == UserRole.caregiver:
        pairings = await crud_pair.list_pairings_for_caregiver(db, current_user.id)
    else:
        pairings = await crud_pair.list_pairings_for_patient(db, current_user.id)
    projected = [await _project_pairing(db, p, viewer=current_user) for p in pairings]
    return PairingStatusOut(role=current_user.role.value, pairings=projected)


@router.post("/invite", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(current_user: CurrentUser, db: DbDep) -> InviteOut:
    """Either role can generate an invite. The redeemer must be of the
    opposite role; that's enforced in /pairing/redeem."""
    invite = await crud_pair.create_invite(db, inviter=current_user)
    return InviteOut.model_validate(invite)


@router.post("/redeem", response_model=PairingOut)
async def redeem(
    payload: RedeemIn,
    current_user: CurrentUser,
    db: DbDep,
    request: Request,
) -> PairingOut:
    # Rate limit by user (8 attempts / minute) and by IP (15 attempts /
    # minute) to make online code-guessing infeasible. Combined with the
    # 15-minute TTL + 32^6 space + single-active code per inviter, the
    # probability of guessing a live code is ~ 1 in 10^7 even at the
    # rate limit ceiling.
    # Prefer the leftmost X-Forwarded-For hop — request.client.host on
    # HF Spaces is always the proxy's internal IP, which would collapse
    # the per-IP bucket to one shared bucket across every real caller.
    xff = request.headers.get("x-forwarded-for")
    ip = (xff.split(",")[0].strip() if xff else None) or (
        request.client.host if request.client else "unknown"
    )
    if not rate_limit.allow(f"redeem:user:{current_user.id}", limit=8, window_seconds=60):
        raise ValidationError_("Too many redeem attempts. Try again in a minute.")
    if not rate_limit.allow(f"redeem:ip:{ip}", limit=15, window_seconds=60):
        raise ValidationError_("Too many redeem attempts from this network.")

    pairing = await crud_pair.redeem(db, code=payload.code, redeemer=current_user)
    return await _project_pairing(db, pairing, viewer=current_user)


@router.delete("")
async def unpair(
    current_user: CurrentUser,
    db: DbDep,
    caregiver_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
) -> Response:
    """Break a specific pairing.

    Post-0008 a patient may have multiple caregivers, so a patient calling
    this must say *which* caregiver to drop via `?caregiver_id=…`. A
    caregiver has at most one patient — passing `?patient_id=…` is
    accepted for symmetry but optional (we'll look up their single
    pairing if omitted).
    """
    if current_user.role == UserRole.caregiver:
        # Caregiver side: caregiver_id is implicitly the caller. Default
        # patient_id to whatever they're paired with right now.
        target_caregiver_id = current_user.id
        if patient_id is None:
            existing = await crud_pair.get_pairing_for_caregiver(db, current_user.id)
            if existing is None:
                raise NotFoundError("You are not paired with anyone.")
            target_patient_id = existing.patient_id
        else:
            target_patient_id = patient_id
    else:
        # Patient side: patient_id is implicitly the caller. Caregiver must
        # be specified because the patient may have multiple.
        target_patient_id = current_user.id
        if caregiver_id is None:
            raise ValidationError_(
                "Patients must specify ?caregiver_id= to identify which pairing to drop."
            )
        target_caregiver_id = caregiver_id
    ok = await crud_pair.break_pairing(
        db,
        user=current_user,
        caregiver_id=target_caregiver_id,
        patient_id=target_patient_id,
    )
    if not ok:
        raise NotFoundError("No pairing to break.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
