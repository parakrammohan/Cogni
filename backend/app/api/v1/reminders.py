"""Reminder routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.crud import reminder as crud_reminder
from app.deps import CurrentUser, DbDep, PatientAccess, require_patient_access
from app.lib.errors import NotFoundError
from app.models.reminder import Reminder
from app.schemas.reminder import ReminderCreate, ReminderOut, ReminderPatch

router_for_patient = APIRouter(prefix="/patients/{patient_id}", tags=["reminders"])
router_for_id = APIRouter(prefix="/reminders", tags=["reminders"])


@router_for_patient.get("/reminders", response_model=list[ReminderOut])
async def list_reminders(patient: PatientAccess, db: DbDep) -> list[ReminderOut]:
    rows = await crud_reminder.list_for_patient(db, patient.id)
    return [ReminderOut.model_validate(r) for r in rows]


@router_for_patient.post(
    "/reminders", response_model=ReminderOut, status_code=status.HTTP_201_CREATED
)
async def create_reminder(
    payload: ReminderCreate, patient: PatientAccess, db: DbDep
) -> ReminderOut:
    row = await crud_reminder.create(db, patient.id, payload.model_dump())
    return ReminderOut.model_validate(row)


async def _load_reminder(
    reminder_id: uuid.UUID, current_user: CurrentUser, db: DbDep
) -> Reminder:
    row = await crud_reminder.get(db, reminder_id)
    if row is None:
        raise NotFoundError("Reminder not found.")
    await require_patient_access(db=db, current_user=current_user, patient_id=row.patient_id)
    return row


LoadedReminder = Annotated[Reminder, Depends(_load_reminder)]


@router_for_id.patch("/{reminder_id}", response_model=ReminderOut)
async def patch_reminder(
    payload: ReminderPatch, row: LoadedReminder, db: DbDep
) -> ReminderOut:
    updated = await crud_reminder.update(db, row, payload.model_dump(exclude_unset=True))
    return ReminderOut.model_validate(updated)


@router_for_id.post("/{reminder_id}/toggle", response_model=ReminderOut)
async def toggle_reminder(row: LoadedReminder, db: DbDep) -> ReminderOut:
    updated = await crud_reminder.toggle_complete(db, row)
    return ReminderOut.model_validate(updated)


@router_for_id.delete("/{reminder_id}")
async def delete_reminder(row: LoadedReminder, db: DbDep) -> Response:
    await crud_reminder.delete_by_id(db, row.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
