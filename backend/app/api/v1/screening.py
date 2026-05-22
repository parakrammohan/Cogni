"""Screening — run a bundled ML model and persist the result."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.deps import DbDep, PatientAccess
from app.lib.errors import ValidationError_
from app.ml import mri as mri_inf
from app.ml import tabular as tab_inf
from app.models.screening import ScreeningBand, ScreeningModel, ScreeningResult
from app.schemas.screening import ScreeningHistoryItem, ScreeningRunOut, TabularRunIn

# Reject MRI uploads larger than this server-side so a 50 MB image
# can't OOM the HF Space worker. Matches the frontend hint in
# MriUploadCard; the real model only ever sees a 288×288 resize anyway.
_MRI_MAX_BYTES = 10 * 1024 * 1024

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
        needs_review=(extras or {}).get("needs_review"),
        created_at=row.created_at or datetime.now(timezone.utc),
    )


# NOTE: declare the static `/screening/alzheimer-mri` route BEFORE the
# parameterised `/screening/{model}` tabular route. FastAPI dispatches in
# registration order — if the dynamic route is registered first, every
# `alzheimer-mri` POST gets matched against the Literal `{model}` validator,
# rejected as 422, and the binary multipart body trips a UTF-8 decode in the
# error pretty-printer (returns a 500). Static-before-dynamic is the fix.
@router_for_patient.post("/screening/alzheimer-mri", response_model=ScreeningRunOut)
async def run_mri(
    patient: PatientAccess,
    db: DbDep,
    image: UploadFile = File(...),
) -> ScreeningRunOut:
    body = await image.read()
    if len(body) > _MRI_MAX_BYTES:
        raise ValidationError_(
            f"Image too large ({len(body) // 1024} KiB). Limit is {_MRI_MAX_BYTES // 1024 // 1024} MiB."
        )
    # ONNX inference is sync + CPU-bound. Running it inline in the async
    # handler blocks the event loop for hundreds of milliseconds (≈250 ms
    # warm on HF Spaces, ≈6 s cold) — every concurrent caregiver's live
    # WS feed stalls for that window. Offload to a threadpool so the
    # event loop keeps servicing other connections.
    result = await run_in_threadpool(mri_inf.predict_from_image, body)
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
            "needs_review": result.get("needs_review"),
        },
    )


@router_for_patient.post("/screening/{model}", response_model=ScreeningRunOut)
async def run_tabular(
    model: TabularModelName,
    payload: TabularRunIn,
    patient: PatientAccess,
    db: DbDep,
) -> ScreeningRunOut:
    # Same reasoning as run_mri: LightGBM/XGBoost/CatBoost `predict_proba`
    # is sync. Threadpool-offload so a screening submission doesn't pause
    # every other connection on the worker.
    result = await run_in_threadpool(tab_inf.predict, model, payload.features)
    return await _persist_and_return(
        db,
        patient.id,
        model,
        payload.features,
        result["probability"],
        result["band"],
        result["classes"],
    )


@router_for_patient.get("/screening", response_model=list[ScreeningHistoryItem])
async def list_history(
    patient: PatientAccess,
    db: DbDep,
    limit: int = Query(default=50, ge=1, le=200),
    model: ScreeningModel | None = Query(default=None),
) -> list[ScreeningHistoryItem]:
    import logging

    log = logging.getLogger("cogni.ml.history")

    stmt = select(ScreeningResult).where(ScreeningResult.patient_id == patient.id)
    if model is not None:
        stmt = stmt.where(ScreeningResult.model == model)
    stmt = stmt.order_by(ScreeningResult.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    rows = res.scalars().all()
    out: list[ScreeningHistoryItem] = []
    for r in rows:
        # Validate one row at a time. A single corrupted row (older
        # enum casing, missing column, classes_json shape drift)
        # used to fail the whole list with a 500 and the caregiver
        # saw "could not load past runs" forever even when 99% of
        # their history was fine. Now we log + skip the bad row and
        # return the rest. The admin-dashboard error panel will show
        # which row tripped.
        try:
            out.append(ScreeningHistoryItem.model_validate(r))
        except Exception as exc:
            log.exception(
                "screening history row %s for patient %s failed to validate: %s",
                getattr(r, "id", "?"),
                patient.id,
                exc,
            )
            continue
    return out
