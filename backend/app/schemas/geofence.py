from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GeofenceZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    name: str
    polygon_geojson: dict
    alert_modes: list[str]
    created_at: datetime
    updated_at: datetime


class GeofenceZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    polygon_geojson: dict
    alert_modes: list[str] = Field(default_factory=list)


class GeofenceZonePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    polygon_geojson: dict | None = None
    alert_modes: list[str] | None = None


class GeofenceSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: uuid.UUID
    wandering_enabled: bool
    updated_at: datetime


class GeofenceSettingsIn(BaseModel):
    wandering_enabled: bool | None = None
