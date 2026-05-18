"""Aggregates the v1 sub-routers under a single `/api/v1` prefix."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth as auth_routes
from app.api.v1 import contacts as contact_routes
from app.api.v1 import health as health_routes
from app.api.v1 import memories as memory_routes
from app.api.v1 import pairing as pairing_routes
from app.api.v1 import profile as profile_routes
from app.api.v1 import reminders as reminder_routes

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_routes.router)
api_v1.include_router(health_routes.router)
api_v1.include_router(pairing_routes.router)
api_v1.include_router(profile_routes.router)
api_v1.include_router(contact_routes.router_for_patient)
api_v1.include_router(contact_routes.router_for_id)
api_v1.include_router(reminder_routes.router_for_patient)
api_v1.include_router(reminder_routes.router_for_id)
api_v1.include_router(memory_routes.router_for_patient)
api_v1.include_router(memory_routes.router_for_id)
