"""Profile route — 1-to-1 with patient, upsert semantics."""

from __future__ import annotations

from fastapi import APIRouter

from app.crud import profile as crud_profile
from app.deps import CurrentUser, DbDep, PatientAccess
from app.lib.errors import PermissionError_
from app.models.user import UserRole
from app.schemas.profile import ProfileIn, ProfileOut

router = APIRouter(prefix="/patients/{patient_id}", tags=["profile"])


@router.get("/profile", response_model=ProfileOut)
async def get_profile(patient: PatientAccess, db: DbDep) -> ProfileOut:
    row = await crud_profile.get_or_create(db, patient.id)
    return ProfileOut.model_validate(row)


@router.put("/profile", response_model=ProfileOut)
async def upsert_profile(
    payload: ProfileIn,
    patient: PatientAccess,
    current_user: CurrentUser,
    db: DbDep,
) -> ProfileOut:
    """Caregivers can always write. Patients can write only when their
    profile isn't `caregiver_locked` — and they can never toggle the
    flag themselves (would let them un-lock unilaterally)."""
    fields = payload.model_dump(exclude_unset=True)
    is_patient_self = current_user.role == UserRole.patient
    if is_patient_self:
        existing = await crud_profile.get_or_create(db, patient.id)
        if existing.caregiver_locked:
            raise PermissionError_(
                "This profile is locked by the caregiver. Ask them to "
                "unlock editing from their Manage page."
            )
        fields.pop("caregiver_locked", None)
    row = await crud_profile.upsert(db, patient.id, fields)
    return ProfileOut.model_validate(row)
