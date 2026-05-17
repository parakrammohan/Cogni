"""Typed exceptions + central FastAPI exception handlers.

Raising one of these from anywhere in the codebase translates to a
predictable JSON response shape:
    { "detail": "...", "code": "snake_case_machine_readable" }
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.code)
        self.detail = detail or self.code


class AuthError(AppError):
    status_code = 401
    code = "auth_error"


class PermissionError_(AppError):
    status_code = 403
    code = "permission_denied"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationError_(AppError):
    status_code = 422
    code = "invalid_input"


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )
