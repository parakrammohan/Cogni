"""Append-only telemetry — game sessions + pursuit results.

Both are patient-scoped histories that drive the caregiver Trends scene.
Simple shape: POST to record, GET to list (newest first, optional limit).
"""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.deps import DbDep, PatientAccess
from app.models.game import GameSession
from app.models.pursuit import PursuitResult
from app.schemas.telemetry import (
    GameSessionCreate,
    GameSessionOut,
    PursuitResultCreate,
    PursuitResultOut,
)

router = APIRouter(prefix="/patients/{patient_id}", tags=["telemetry"])


@router.get("/game-sessions", response_model=list[GameSessionOut])
async def list_game_sessions(
    patient: PatientAccess,
    db: DbDep,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[GameSessionOut]:
    res = await db.execute(
        select(GameSession)
        .where(GameSession.patient_id == patient.id)
        .order_by(GameSession.created_at.desc())
        .limit(limit)
    )
    return [GameSessionOut.model_validate(r) for r in res.scalars().all()]


@router.post(
    "/game-sessions",
    response_model=GameSessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_game_session(
    payload: GameSessionCreate, patient: PatientAccess, db: DbDep
) -> GameSessionOut:
    row = GameSession(patient_id=patient.id, **payload.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return GameSessionOut.model_validate(row)


@router.get("/pursuit-results", response_model=list[PursuitResultOut])
async def list_pursuit_results(
    patient: PatientAccess,
    db: DbDep,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[PursuitResultOut]:
    res = await db.execute(
        select(PursuitResult)
        .where(PursuitResult.patient_id == patient.id)
        .order_by(PursuitResult.created_at.desc())
        .limit(limit)
    )
    return [PursuitResultOut.model_validate(r) for r in res.scalars().all()]


@router.post(
    "/pursuit-results",
    response_model=PursuitResultOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_pursuit_result(
    payload: PursuitResultCreate, patient: PatientAccess, db: DbDep
) -> PursuitResultOut:
    row = PursuitResult(patient_id=patient.id, **payload.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return PursuitResultOut.model_validate(row)
