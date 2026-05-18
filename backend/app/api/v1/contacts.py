"""Contact routes: list/create under /patients/{id}, update/delete on /contacts/{id}."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.crud import contact as crud_contact
from app.deps import CurrentUser, DbDep, PatientAccess, require_patient_access
from app.lib.errors import NotFoundError
from app.models.contact import Contact
from app.schemas.contact import ContactCreate, ContactOut, ContactPatch

router_for_patient = APIRouter(prefix="/patients/{patient_id}", tags=["contacts"])
router_for_id = APIRouter(prefix="/contacts", tags=["contacts"])


@router_for_patient.get("/contacts", response_model=list[ContactOut])
async def list_contacts(patient: PatientAccess, db: DbDep) -> list[ContactOut]:
    rows = await crud_contact.list_for_patient(db, patient.id)
    return [ContactOut.model_validate(r) for r in rows]


@router_for_patient.post(
    "/contacts", response_model=ContactOut, status_code=status.HTTP_201_CREATED
)
async def create_contact(
    payload: ContactCreate, patient: PatientAccess, db: DbDep
) -> ContactOut:
    row = await crud_contact.create(db, patient.id, payload.model_dump())
    return ContactOut.model_validate(row)


async def _load_contact(
    contact_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
) -> Contact:
    row = await crud_contact.get(db, contact_id)
    if row is None:
        raise NotFoundError("Contact not found.")
    await require_patient_access(db=db, current_user=current_user, patient_id=row.patient_id)
    return row


LoadedContact = Annotated[Contact, Depends(_load_contact)]


@router_for_id.patch("/{contact_id}", response_model=ContactOut)
async def patch_contact(
    payload: ContactPatch, row: LoadedContact, db: DbDep
) -> ContactOut:
    updated = await crud_contact.update(db, row, payload.model_dump(exclude_unset=True))
    return ContactOut.model_validate(updated)


@router_for_id.delete("/{contact_id}")
async def delete_contact(row: LoadedContact, db: DbDep) -> Response:
    await crud_contact.delete_by_id(db, row.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
