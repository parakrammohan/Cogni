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
    flag themselves (would let them un-lock unilaterally).

    The patient-side path uses `upsert_as_patient_if_unlocked` which
    pessimistic-locks the row before reading `caregiver_locked`, closing
    the TOCTOU window between "read unlocked" and "write fields" that
    would otherwise let a stale-tab patient slip an edit past a
    concurrent caregiver lock toggle.
    """
    fields = payload.model_dump(exclude_unset=True)
    if current_user.role == UserRole.patient:
        fields.pop("caregiver_locked", None)
        row = await crud_profile.upsert_as_patient_if_unlocked(db, patient.id, fields)
        if row is None:
            raise PermissionError_(
                "This profile is locked by the caregiver. Ask them to "
                "unlock editing from their Manage page."
            )
        return ProfileOut.model_validate(row)
    row = await crud_profile.upsert(db, patient.id, fields)
    return ProfileOut.model_validate(row)
