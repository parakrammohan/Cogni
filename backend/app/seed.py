"""Idempotent demo-account seeding.

Runs once on startup (unless SEED_DEMO_USERS=false) so the deployed
backend always has a known caregiver + patient pair available for
manual demo, Playwright tests, and the live site walkthrough.
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.crud import user as crud_user
from app.db import session_scope
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
        existing_caregiver = await crud_user.get_by_username(db, DEMO_CAREGIVER_USERNAME)
        existing_patient = await crud_user.get_by_username(db, DEMO_PATIENT_USERNAME)

        if existing_caregiver is None:
            await crud_user.create(
                db,
                username=DEMO_CAREGIVER_USERNAME,
                password=settings.demo_password,
                role=UserRole.caregiver,
                display_name="Demo Caregiver",
            )
            log.info("Seeded demo caregiver: %s", DEMO_CAREGIVER_USERNAME)

        if existing_patient is None:
            await crud_user.create(
                db,
                username=DEMO_PATIENT_USERNAME,
                password=settings.demo_password,
                role=UserRole.patient,
                display_name="Demo Patient",
            )
            log.info("Seeded demo patient: %s", DEMO_PATIENT_USERNAME)

        # Pairing the two accounts becomes possible once Stage 2 lands
        # the pairings table; this seed will be extended then.
