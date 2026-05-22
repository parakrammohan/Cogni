"""Shared FastAPI dependencies — session-cookie based auth."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Cookie, Depends, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crud import pairing as crud_pair
from app.crud import session as crud_session
from app.crud import user as crud_user
from app.db import get_sessionmaker
from app.lib.errors import AuthError, NotFoundError, PermissionError_
from app.models.user import User, UserRole

_settings = get_settings()


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    request: Request,
    db: DbDep,
    cogni_session: Annotated[str | None, Cookie(alias=_settings.session_cookie_name)] = None,
) -> User:
    if not cogni_session:
        raise AuthError("Not signed in")
    found = await crud_session.get_active_with_user(db, cogni_session)
    if found is None:
        raise AuthError("Session invalid or expired")

    session_row, user = found
    # Slide the last_used_at timestamp. Cheap (~1 UPDATE), gives us a
    # "last active" signal per session row for future device management.
    await crud_session.touch(db, session_row)

    # Stash on the request so route handlers + future middleware can read
    # the session row directly without another lookup.
    request.state.session = session_row
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_patient_access(
    db: DbDep,
    current_user: CurrentUser,
    patient_id: Annotated[uuid.UUID, Path()],
) -> User:
    """Authorize the current request against a `patient_id` from the URL.

    Single rule: a request may touch patient-scoped data iff the caller is
    that patient OR is the paired caregiver. Used as a sub-dependency on
    every `/patients/{patient_id}/…` route.
    """
    if current_user.role == UserRole.patient:
        if current_user.id != patient_id:
            raise PermissionError_("Cross-patient access forbidden.")
        return current_user
    # Caregiver — must be paired with this patient. Post-0008 the patient
    # may have multiple caregivers; the caller is authorised iff *any* of
    # those pairings names them.
    pairings = await crud_pair.list_pairings_for_patient(db, patient_id)
    if not any(p.caregiver_id == current_user.id for p in pairings):
        raise PermissionError_("You are not paired with this patient.")
    patient = await crud_user.get_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError("Patient not found.")
    return patient


PatientAccess = Annotated[User, Depends(require_patient_access)]
