"""Idempotent demo-account + pairing seeding.

Runs once on startup (unless SEED_DEMO_USERS=false) so the deployed
backend always has a known caregiver + patient pair, already paired,
available for manual demo, Playwright tests, and the live site walkthrough.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.config import get_settings
from app.crud import user as crud_user
from app.db import session_scope
from app.models.pairing import Pairing
from app.models.user import UserRole

log = logging.getLogger(__name__)

DEMO_CAREGIVER_USERNAME = "demo-caregiver"
DEMO_PATIENT_USERNAME = "demo-patient"


async def seed_demo_users() -> None:
    settings = get_settings()
    if not settings.seed_demo_users:
        log.info("SEED_DEMO_USERS=false — skipping demo seed")
        return

    async with session_scope() as db:
        caregiver = await crud_user.get_by_username(db, DEMO_CAREGIVER_USERNAME)
        patient = await crud_user.get_by_username(db, DEMO_PATIENT_USERNAME)

        if caregiver is None:
            caregiver = await crud_user.create(
                db,
                username=DEMO_CAREGIVER_USERNAME,
                password=settings.demo_password,
                role=UserRole.caregiver,
                display_name="Demo Caregiver",
            )
            log.info("Seeded demo caregiver: %s", DEMO_CAREGIVER_USERNAME)

        if patient is None:
            patient = await crud_user.create(
                db,
                username=DEMO_PATIENT_USERNAME,
                password=settings.demo_password,
                role=UserRole.patient,
                display_name="Demo Patient",
            )
            log.info("Seeded demo patient: %s", DEMO_PATIENT_USERNAME)

        # Idempotent pair: insert only if no pairing exists for the patient.
        existing = (
            await db.execute(select(Pairing).where(Pairing.patient_id == patient.id))
        ).scalar_one_or_none()
        if existing is None:
            db.add(Pairing(caregiver_id=caregiver.id, patient_id=patient.id))
            log.info(
                "Seeded pairing: %s ↔ %s",
                DEMO_CAREGIVER_USERNAME,
                DEMO_PATIENT_USERNAME,
            )
