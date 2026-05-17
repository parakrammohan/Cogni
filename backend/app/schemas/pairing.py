from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    expires_at: datetime


class RedeemIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class PairedPartner(BaseModel):
    """Minimal projection of the other side of the pairing — enough
    to render 'Paired with X' UI without surfacing internal data."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    role: Literal["caregiver", "patient"]


class PairingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pairing_id: uuid.UUID
    established_at: datetime
    partner: PairedPartner


class PairingStatusOut(BaseModel):
    """Returned from GET /pairing/status.

    For a caregiver: `pairings` is the list of all patients they care
    for. For a patient: `pairings` is either empty or a single-element
    list with the caregiver.
    """

    role: Literal["caregiver", "patient"]
    pairings: list[PairingOut]
