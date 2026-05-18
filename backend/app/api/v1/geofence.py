"""Geofence — N zones + 1 settings row per patient."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select

from app.deps import CurrentUser, DbDep, PatientAccess, require_patient_access
from app.lib.errors import NotFoundError
from app.models.geofence import GeofenceSettings, GeofenceZone
from app.schemas.geofence import (
    GeofenceSettingsIn,
    GeofenceSettingsOut,
    GeofenceZoneCreate,
    GeofenceZoneOut,
    GeofenceZonePatch,
)

router_for_patient = APIRouter(prefix="/patients/{patient_id}", tags=["geofence"])
router_for_id = APIRouter(prefix="/geofence-zones", tags=["geofence"])


@router_for_patient.get("/geofence-zones", response_model=list[GeofenceZoneOut])
async def list_zones(patient: PatientAccess, db: DbDep) -> list[GeofenceZoneOut]:
    res = await db.execute(
        select(GeofenceZone)
        .where(GeofenceZone.patient_id == patient.id)
        .order_by(GeofenceZone.created_at)
    )
    return [GeofenceZoneOut.model_validate(r) for r in res.scalars().all()]


@router_for_patient.post(
    "/geofence-zones",
    response_model=GeofenceZoneOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_zone(
    payload: GeofenceZoneCreate, patient: PatientAccess, db: DbDep
) -> GeofenceZoneOut:
    row = GeofenceZone(patient_id=patient.id, **payload.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return GeofenceZoneOut.model_validate(row)


async def _load_zone(
    zone_id: uuid.UUID, current_user: CurrentUser, db: DbDep
) -> GeofenceZone:
    res = await db.execute(select(GeofenceZone).where(GeofenceZone.id == zone_id))
    row = res.scalar_one_or_none()
    if row is None:
        raise NotFoundError("Geofence zone not found.")
    await require_patient_access(db=db, current_user=current_user, patient_id=row.patient_id)
    return row


LoadedZone = Annotated[GeofenceZone, Depends(_load_zone)]


@router_for_id.patch("/{zone_id}", response_model=GeofenceZoneOut)
async def patch_zone(
    payload: GeofenceZonePatch, row: LoadedZone, db: DbDep
) -> GeofenceZoneOut:
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return GeofenceZoneOut.model_validate(row)


@router_for_id.delete("/{zone_id}")
async def delete_zone(row: LoadedZone, db: DbDep) -> Response:
    await db.execute(delete(GeofenceZone).where(GeofenceZone.id == row.id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----- Settings (1-1) --------------------------------------------------------


async def _get_or_create_settings(db, patient_id: uuid.UUID) -> GeofenceSettings:
    res = await db.execute(
        select(GeofenceSettings).where(GeofenceSettings.patient_id == patient_id)
    )
    row = res.scalar_one_or_none()
    if row is None:
        row = GeofenceSettings(patient_id=patient_id)
        db.add(row)
        await db.flush()
        await db.refresh(row)
    return row


@router_for_patient.get(
    "/geofence-settings", response_model=GeofenceSettingsOut
)
async def get_settings(patient: PatientAccess, db: DbDep) -> GeofenceSettingsOut:
    row = await _get_or_create_settings(db, patient.id)
    return GeofenceSettingsOut.model_validate(row)


@router_for_patient.put(
    "/geofence-settings", response_model=GeofenceSettingsOut
)
async def upsert_settings(
    payload: GeofenceSettingsIn, patient: PatientAccess, db: DbDep
) -> GeofenceSettingsOut:
    row = await _get_or_create_settings(db, patient.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return GeofenceSettingsOut.model_validate(row)
