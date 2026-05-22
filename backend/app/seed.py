"""Idempotent demo-account + pairing seeding.

Runs once on startup (unless SEED_DEMO_USERS=false) so the deployed
backend always has four known accounts in two pre-paired sets:

  showcase-caregiver  ↔  showcase-patient    (demo_password)
  live-demo-caregiver ↔  live-demo-patient   (live_demo_patient_password
                                               for the patient only;
                                               caregiver still uses
                                               demo_password)

The "showcase" pair is for manual testing / Playwright / judge
walkthroughs — both credentials surface on the AuthScreen demo popover.
The "live-demo" pair backs the actual live demo session; only the
caregiver credentials surface on the popover so passers-by can sign in
to *observe* but the patient device stays untouchable.
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

SHOWCASE_CAREGIVER_USERNAME = "showcase-caregiver"
SHOWCASE_PATIENT_USERNAME = "showcase-patient"
LIVE_DEMO_CAREGIVER_USERNAME = "live-demo-caregiver"
LIVE_DEMO_PATIENT_USERNAME = "live-demo-patient"


async def seed_demo_users() -> None:
    settings = get_settings()
    if not settings.seed_demo_users:
        log.info("SEED_DEMO_USERS=false — skipping demo seed")
        return

    pairs = [
        (
            SHOWCASE_CAREGIVER_USERNAME,
            "Showcase Caregiver",
            settings.demo_password,
            SHOWCASE_PATIENT_USERNAME,
            "Showcase Patient",
            settings.demo_password,
        ),
        (
            LIVE_DEMO_CAREGIVER_USERNAME,
            "Live Demo Caregiver",
            settings.demo_password,
            LIVE_DEMO_PATIENT_USERNAME,
            "Live Demo Patient",
            settings.live_demo_patient_password,
        ),
    ]

    async with session_scope() as db:
        for (
            caregiver_username,
            caregiver_display,
            caregiver_password,
            patient_username,
            patient_display,
            patient_password,
        ) in pairs:
            caregiver = await crud_user.get_by_username(db, caregiver_username)
            patient = await crud_user.get_by_username(db, patient_username)

            if caregiver is None:
                caregiver = await crud_user.create(
                    db,
                    username=caregiver_username,
                    password=caregiver_password,
                    role=UserRole.caregiver,
                    display_name=caregiver_display,
                )
                log.info("Seeded caregiver: %s", caregiver_username)

            if patient is None:
                patient = await crud_user.create(
                    db,
                    username=patient_username,
                    password=patient_password,
                    role=UserRole.patient,
                    display_name=patient_display,
                )
                log.info("Seeded patient: %s", patient_username)

            existing = (
                await db.execute(select(Pairing).where(Pairing.patient_id == patient.id))
            ).scalar_one_or_none()
            if existing is None:
                db.add(Pairing(caregiver_id=caregiver.id, patient_id=patient.id))
                log.info(
                    "Seeded pairing: %s ↔ %s",
                    caregiver_username,
                    patient_username,
                )
