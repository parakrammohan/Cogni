"""Idempotent demo-account + profile seeding.

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

Each patient also gets a Profile row + a couple of Contacts + a couple
of Reminders so the caregiver UI has something realistic to render
straight after first login (instead of empty "No profile yet" states).
Idempotency: a row is only inserted if none already exist for that
patient — the operator can edit the demo data in the dashboard without
their changes getting clobbered on next boot.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select

from app.config import get_settings
from app.crud import user as crud_user
from app.db import session_scope
from app.models.contact import Contact
from app.models.pairing import Pairing
from app.models.profile import Profile
from app.models.reminder import Reminder
from app.models.user import User, UserRole

log = logging.getLogger(__name__)

SHOWCASE_CAREGIVER_USERNAME = "showcase-caregiver"
SHOWCASE_PATIENT_USERNAME = "showcase-patient"
LIVE_DEMO_CAREGIVER_USERNAME = "live-demo-caregiver"
LIVE_DEMO_PATIENT_USERNAME = "live-demo-patient"


@dataclass(frozen=True)
class ContactSeed:
    name: str
    relationship: str
    phone: str
    is_emergency: bool = False


@dataclass(frozen=True)
class ReminderSeed:
    label: str
    notes: str
    time_of_day: str  # HH:MM


@dataclass(frozen=True)
class PatientSeed:
    username: str
    display_name: str
    password: str
    full_name: str
    preferred_name: str
    birth_date: date
    blood_type: str
    allergies: str
    medical_notes: str
    home_address: str
    contacts: list[ContactSeed] = field(default_factory=list)
    reminders: list[ReminderSeed] = field(default_factory=list)


@dataclass(frozen=True)
class PairSeed:
    caregiver_username: str
    caregiver_display: str
    caregiver_password: str
    patient: PatientSeed


def _build_pairs() -> list[PairSeed]:
    settings = get_settings()
    return [
        PairSeed(
            caregiver_username=SHOWCASE_CAREGIVER_USERNAME,
            caregiver_display="Showcase Caregiver",
            caregiver_password=settings.demo_password,
            patient=PatientSeed(
                username=SHOWCASE_PATIENT_USERNAME,
                display_name="Showcase Patient",
                password=settings.demo_password,
                full_name="Sam Tan",
                preferred_name="Sam",
                birth_date=date(1948, 4, 12),
                blood_type="O+",
                allergies="Penicillin",
                medical_notes="Mild dementia. Takes donepezil 10mg in the morning.",
                home_address="12 Orchard Road, Singapore",
                contacts=[
                    ContactSeed("Anna Tan", "Daughter", "+65 9123 4567", is_emergency=True),
                    ContactSeed("Dr Lee", "GP", "+65 6789 1234"),
                ],
                reminders=[
                    ReminderSeed("Morning pills", "Donepezil 10mg with breakfast", "08:00"),
                    ReminderSeed("Lunch", "Eat with family", "12:30"),
                    ReminderSeed("Evening walk", "Short walk around the block", "17:00"),
                ],
            ),
        ),
        PairSeed(
            caregiver_username=LIVE_DEMO_CAREGIVER_USERNAME,
            caregiver_display="Live Demo Caregiver",
            caregiver_password=settings.demo_password,
            patient=PatientSeed(
                username=LIVE_DEMO_PATIENT_USERNAME,
                display_name="Live Demo Patient",
                password=settings.live_demo_patient_password,
                full_name="Jane Lim",
                preferred_name="Jane",
                birth_date=date(1950, 9, 3),
                blood_type="A+",
                allergies="None known",
                medical_notes="Early-stage Alzheimer's. Daily memory exercises.",
                home_address="45 Bedok Avenue, Singapore",
                contacts=[
                    ContactSeed("Mike Lim", "Son", "+65 9234 5678", is_emergency=True),
                    ContactSeed("Sarah Wong", "Neighbour", "+65 8123 4567"),
                ],
                reminders=[
                    ReminderSeed("Take medication", "Memantine 10mg", "09:00"),
                    ReminderSeed("Drink water", "Aim for 8 glasses today", "14:00"),
                    ReminderSeed("Call family", "Catch up with Mike or grandkids", "19:00"),
                ],
            ),
        ),
    ]


async def _ensure_user(db, username: str, password: str, role: UserRole, display_name: str) -> User:
    existing = await crud_user.get_by_username(db, username)
    if existing is not None:
        return existing
    created = await crud_user.create(
        db,
        username=username,
        password=password,
        role=role,
        display_name=display_name,
    )
    log.info("Seeded %s: %s", role.value, username)
    return created


async def _ensure_pairing(db, caregiver: User, patient: User) -> None:
    existing = (
        await db.execute(select(Pairing).where(Pairing.patient_id == patient.id))
    ).scalar_one_or_none()
    if existing is None:
        db.add(Pairing(caregiver_id=caregiver.id, patient_id=patient.id))
        log.info("Seeded pairing: %s ↔ %s", caregiver.username, patient.username)


async def _ensure_profile(db, patient: User, seed: PatientSeed) -> None:
    """Insert a Profile row only if the patient doesn't already have one.
    Profile is 1-to-1 keyed on patient_id, so the absence check is a PK
    lookup. We do not update an existing profile — the operator may
    have edited it via the dashboard and we don't want a boot to
    clobber their changes."""
    existing = await db.get(Profile, patient.id)
    if existing is not None:
        return
    db.add(
        Profile(
            patient_id=patient.id,
            full_name=seed.full_name,
            preferred_name=seed.preferred_name,
            birth_date=seed.birth_date,
            blood_type=seed.blood_type,
            allergies=seed.allergies,
            medical_notes=seed.medical_notes,
            home_address=seed.home_address,
            photo_url="",
        )
    )
    log.info("Seeded profile for %s", patient.username)


async def _ensure_contacts(db, patient: User, seeds: list[ContactSeed]) -> None:
    """Insert contacts only if the patient has zero contacts yet.
    `name` and `phone` are Fernet-encrypted at rest so we can't query
    by them; using "has any contacts?" as the idempotency check keeps
    the logic simple and avoids re-seeding deleted demo rows that the
    operator may have intentionally cleared."""
    count = (
        await db.execute(select(func.count()).select_from(Contact).where(Contact.patient_id == patient.id))
    ).scalar() or 0
    if count > 0:
        return
    for sort_order, c in enumerate(seeds):
        db.add(
            Contact(
                patient_id=patient.id,
                name=c.name,
                relationship=c.relationship,
                phone=c.phone,
                is_emergency=c.is_emergency,
                sort_order=sort_order,
            )
        )
    if seeds:
        log.info("Seeded %d contacts for %s", len(seeds), patient.username)


async def _ensure_reminders(db, patient: User, seeds: list[ReminderSeed]) -> None:
    count = (
        await db.execute(select(func.count()).select_from(Reminder).where(Reminder.patient_id == patient.id))
    ).scalar() or 0
    if count > 0:
        return
    for r in seeds:
        db.add(
            Reminder(
                patient_id=patient.id,
                label=r.label,
                notes=r.notes,
                time_of_day=r.time_of_day,
                recurring=True,
            )
        )
    if seeds:
        log.info("Seeded %d reminders for %s", len(seeds), patient.username)


async def seed_demo_users() -> None:
    settings = get_settings()
    if not settings.seed_demo_users:
        log.info("SEED_DEMO_USERS=false — skipping demo seed")
        return

    async with session_scope() as db:
        for pair in _build_pairs():
            caregiver = await _ensure_user(
                db,
                pair.caregiver_username,
                pair.caregiver_password,
                UserRole.caregiver,
                pair.caregiver_display,
            )
            patient = await _ensure_user(
                db,
                pair.patient.username,
                pair.patient.password,
                UserRole.patient,
                pair.patient.display_name,
            )
            await _ensure_pairing(db, caregiver, patient)
            await _ensure_profile(db, patient, pair.patient)
            await _ensure_contacts(db, patient, pair.patient.contacts)
            await _ensure_reminders(db, patient, pair.patient.reminders)
