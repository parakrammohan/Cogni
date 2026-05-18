"""Memory routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.crud import memory as crud_memory
from app.deps import CurrentUser, DbDep, PatientAccess, require_patient_access
from app.lib.errors import NotFoundError
from app.models.memory import Memory
from app.schemas.memory import MemoryCreate, MemoryOut, MemoryPatch

router_for_patient = APIRouter(prefix="/patients/{patient_id}", tags=["memories"])
router_for_id = APIRouter(prefix="/memories", tags=["memories"])


@router_for_patient.get("/memories", response_model=list[MemoryOut])
async def list_memories(patient: PatientAccess, db: DbDep) -> list[MemoryOut]:
    rows = await crud_memory.list_for_patient(db, patient.id)
    return [MemoryOut.model_validate(r) for r in rows]


@router_for_patient.post(
    "/memories", response_model=MemoryOut, status_code=status.HTTP_201_CREATED
)
async def create_memory(
    payload: MemoryCreate, patient: PatientAccess, db: DbDep
) -> MemoryOut:
    row = await crud_memory.create(db, patient.id, payload.model_dump())
    return MemoryOut.model_validate(row)


async def _load_memory(
    memory_id: uuid.UUID, current_user: CurrentUser, db: DbDep
) -> Memory:
    row = await crud_memory.get(db, memory_id)
    if row is None:
        raise NotFoundError("Memory not found.")
    await require_patient_access(db=db, current_user=current_user, patient_id=row.patient_id)
    return row


LoadedMemory = Annotated[Memory, Depends(_load_memory)]


@router_for_id.patch("/{memory_id}", response_model=MemoryOut)
async def patch_memory(
    payload: MemoryPatch, row: LoadedMemory, db: DbDep
) -> MemoryOut:
    updated = await crud_memory.update(db, row, payload.model_dump(exclude_unset=True))
    return MemoryOut.model_validate(updated)


@router_for_id.delete("/{memory_id}")
async def delete_memory(row: LoadedMemory, db: DbDep) -> Response:
    await crud_memory.delete_by_id(db, row.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
