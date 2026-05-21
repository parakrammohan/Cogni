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
    if current_user.role == UserRole.caregiver:
        pairings = await crud_pair.list_pairings_for_caregiver(db, current_user.id)
    else:
        single = await crud_pair.get_pairing_for_patient(db, current_user.id)
        pairings = [single] if single else []
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
    patient_id: uuid.UUID | None = None,
) -> Response:
    """Break the current pairing.

    - A patient calling with no body breaks their own pairing.
    - A caregiver must pass `?patient_id=…` identifying which patient
      to release (they may have several).
    """
    if current_user.role == UserRole.patient:
        target_id = current_user.id
    else:
        if patient_id is None:
            raise ValidationError_("Caregivers must specify ?patient_id= to unpair.")
        target_id = patient_id
    ok = await crud_pair.break_pairing(db, user=current_user, patient_id=target_id)
    if not ok:
        raise NotFoundError("No pairing to break.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
