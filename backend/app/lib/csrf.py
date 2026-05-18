"""Origin-based CSRF defence.

Because cookies are sent with cross-origin requests (SameSite=None), we
can't rely on SameSite alone. We instead validate the `Origin` header
on state-changing requests: if it's set, it must be in our allow list.

This works because:
  - Browsers always set `Origin` on CORS requests with credentials.
  - The CORS preflight already blocks calls from non-whitelisted
    origins; this is belt-and-suspenders for the rare browser that
    skips preflight (older mobile browsers, scripts hitting raw fetch).
  - We never accept state changes over GET, so a CSRF that can't set
    headers (e.g. a form submission to /auth/login) is blocked by the
    method check.
"""

from __future__ import annotations

import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

log = logging.getLogger("cogni.csrf")

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# The admin dashboard is server-rendered HTML on the HF Space's own
# origin — it never gets called cross-origin and uses a separate cookie.
# Skipping it here means the admin form POSTs aren't blocked because
# the Space's hostname isn't (and shouldn't be) in the CORS allow-list.
_ALWAYS_ALLOWED_PREFIXES = ("/admin",)


class OriginCsrfMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests whose Origin isn't whitelisted."""

    def __init__(self, app, allowed_origins: list[str]) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.allowed = set(allowed_origins)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _SAFE_METHODS:
            return await call_next(request)
        if any(request.url.path.startswith(p) for p in _ALWAYS_ALLOWED_PREFIXES):
            return await call_next(request)

        origin = request.headers.get("origin")
        if origin and origin not in self.allowed:
            log.warning("Blocked %s %s — origin %r not allowed", request.method, request.url.path, origin)
            return JSONResponse(
                status_code=403,
                content={"detail": "Origin not allowed", "code": "origin_blocked"},
            )
        return await call_next(request)
