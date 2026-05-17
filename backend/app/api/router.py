"""Aggregates the v1 sub-routers under a single `/api/v1` prefix."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth as auth_routes
from app.api.v1 import health as health_routes

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_routes.router)
api_v1.include_router(health_routes.router)
