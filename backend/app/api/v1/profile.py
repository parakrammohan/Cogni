"""Profile route — 1-to-1 with patient, upsert semantics."""

from __future__ import annotations

from fastapi import APIRouter

from app.crud import profile as crud_profile
from app.deps import DbDep, PatientAccess
from app.schemas.profile import ProfileIn, ProfileOut

router = APIRouter(prefix="/patients/{patient_id}", tags=["profile"])


@router.get("/profile", response_model=ProfileOut)
async def get_profile(patient: PatientAccess, db: DbDep) -> ProfileOut:
    row = await crud_profile.get_or_create(db, patient.id)
    return ProfileOut.model_validate(row)


@router.put("/profile", response_model=ProfileOut)
async def upsert_profile(payload: ProfileIn, patient: PatientAccess, db: DbDep) -> ProfileOut:
    row = await crud_profile.upsert(db, patient.id, payload.model_dump(exclude_unset=True))
    return ProfileOut.model_validate(row)
