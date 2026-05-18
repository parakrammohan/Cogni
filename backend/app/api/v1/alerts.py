"""Alerts — caregiver-visible feed of clinical anomalies."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import delete, select

from app.deps import CurrentUser, DbDep, PatientAccess, require_patient_access
from app.lib.errors import NotFoundError
from app.models.alert import Alert
from app.schemas.alert import AlertCreate, AlertOut

router_for_patient = APIRouter(prefix="/patients/{patient_id}", tags=["alerts"])
router_for_id = APIRouter(prefix="/alerts", tags=["alerts"])


@router_for_patient.get("/alerts", response_model=list[AlertOut])
async def list_alerts(
    patient: PatientAccess,
    db: DbDep,
    include_dismissed: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[AlertOut]:
    stmt = select(Alert).where(Alert.patient_id == patient.id)
    if not include_dismissed:
        stmt = stmt.where(Alert.dismissed.is_(False))
    stmt = stmt.order_by(Alert.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    return [AlertOut.model_validate(r) for r in res.scalars().all()]


@router_for_patient.post(
    "/alerts", response_model=AlertOut, status_code=status.HTTP_201_CREATED
)
async def create_alert(
    payload: AlertCreate, patient: PatientAccess, db: DbDep
) -> AlertOut:
    row = Alert(patient_id=patient.id, **payload.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return AlertOut.model_validate(row)


async def _load_alert(
    alert_id: uuid.UUID, current_user: CurrentUser, db: DbDep
) -> Alert:
    res = await db.execute(select(Alert).where(Alert.id == alert_id))
    row = res.scalar_one_or_none()
    if row is None:
        raise NotFoundError("Alert not found.")
    await require_patient_access(db=db, current_user=current_user, patient_id=row.patient_id)
    return row


LoadedAlert = Annotated[Alert, Depends(_load_alert)]


@router_for_id.post("/{alert_id}/dismiss", response_model=AlertOut)
async def dismiss_alert(row: LoadedAlert, db: DbDep) -> AlertOut:
    row.dismissed = True
    await db.flush()
    await db.refresh(row)
    return AlertOut.model_validate(row)


@router_for_id.delete("/{alert_id}")
async def delete_alert(row: LoadedAlert, db: DbDep) -> Response:
    await db.execute(delete(Alert).where(Alert.id == row.id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
