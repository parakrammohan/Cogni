"""Screening — run a bundled ML model and persist the result."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, File, Query, UploadFile
from sqlalchemy import select

from app.deps import DbDep, PatientAccess
from app.ml import mri as mri_inf
from app.ml import tabular as tab_inf
from app.models.screening import ScreeningBand, ScreeningModel, ScreeningResult
from app.schemas.screening import ScreeningHistoryItem, ScreeningRunOut, TabularRunIn

router_for_patient = APIRouter(prefix="/patients/{patient_id}", tags=["screening"])

TabularModelName = Literal["alzheimer_tabular", "dementia_oasis", "adresso_agitation"]


async def _persist_and_return(
    db,
    patient_id,
    model_name: str,
    inputs_json: dict,
    probability: float,
    band: str,
    classes: list[str],
    extras: dict | None = None,
) -> ScreeningRunOut:
    row = ScreeningResult(
        patient_id=patient_id,
        model=ScreeningModel(model_name),
        inputs_json=inputs_json,
        probability=probability,
        band=ScreeningBand(band),
        classes_json={"classes": classes, **(extras or {})},
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return ScreeningRunOut(
        id=row.id,
        patient_id=row.patient_id,
        model=model_name,  # type: ignore[arg-type]
        probability=probability,
        band=band,  # type: ignore[arg-type]
        classes=classes,
        probabilities=(extras or {}).get("probabilities"),
        top=(extras or {}).get("top"),
        confidence=(extras or {}).get("confidence"),
        created_at=row.created_at or datetime.now(timezone.utc),
    )


@router_for_patient.post("/screening/{model}", response_model=ScreeningRunOut)
async def run_tabular(
    model: TabularModelName,
    payload: TabularRunIn,
    patient: PatientAccess,
    db: DbDep,
) -> ScreeningRunOut:
    result = tab_inf.predict(model, payload.features)
    return await _persist_and_return(
        db,
        patient.id,
        model,
        payload.features,
        result["probability"],
        result["band"],
        result["classes"],
    )


@router_for_patient.post("/screening/alzheimer-mri", response_model=ScreeningRunOut)
async def run_mri(
    patient: PatientAccess,
    db: DbDep,
    image: UploadFile = File(...),
) -> ScreeningRunOut:
    body = await image.read()
    result = mri_inf.predict_from_image(body)
    return await _persist_and_return(
        db,
        patient.id,
        "alzheimer_mri",
        {"filename": image.filename, "content_type": image.content_type, "size": len(body)},
        result["probability"],
        result["band"],
        result["classes"],
        extras={
            "probabilities": result["probabilities"],
            "top": result["top"],
            "confidence": result["confidence"],
        },
    )


@router_for_patient.get("/screening", response_model=list[ScreeningHistoryItem])
async def list_history(
    patient: PatientAccess,
    db: DbDep,
    limit: int = Query(default=50, ge=1, le=200),
    model: ScreeningModel | None = Query(default=None),
) -> list[ScreeningHistoryItem]:
    stmt = select(ScreeningResult).where(ScreeningResult.patient_id == patient.id)
    if model is not None:
        stmt = stmt.where(ScreeningResult.model == model)
    stmt = stmt.order_by(ScreeningResult.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    return [ScreeningHistoryItem.model_validate(r) for r in res.scalars().all()]
