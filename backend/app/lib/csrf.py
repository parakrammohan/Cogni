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


class OriginCsrfMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests whose Origin isn't whitelisted.

    Strict mode: state-changing methods MUST carry an `Origin` header,
    and it must either match the request's own host (same-origin
    submissions like the admin dashboard form) or appear in the explicit
    allow list (cross-origin from the Vercel SPA). Missing Origin is
    rejected — the previous "allow if absent" path let non-browser
    callers with stolen cookies bypass the check entirely.
    """

    def __init__(self, app, allowed_origins: list[str]) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.allowed = set(allowed_origins)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _SAFE_METHODS:
            return await call_next(request)

        origin = request.headers.get("origin")
        host = request.headers.get("host")
        # Same-origin requests (admin dashboard form POSTing to itself)
        # don't need to be in the CORS allow list — the Space's own host
        # is implicitly trusted because a cross-origin attacker can't
        # forge a matching Host header inside the browser sandbox.
        same_origin = None
        if origin and host:
            scheme = request.url.scheme
            same_origin = f"{scheme}://{host}"

        if origin is None:
            log.warning("Blocked %s %s — Origin header missing", request.method, request.url.path)
            return JSONResponse(
                status_code=403,
                content={"detail": "Origin header required on state-changing requests", "code": "origin_blocked"},
            )
        if origin == same_origin:
            return await call_next(request)
        if origin not in self.allowed:
            log.warning("Blocked %s %s — origin %r not allowed", request.method, request.url.path, origin)
            return JSONResponse(
                status_code=403,
                content={"detail": "Origin not allowed", "code": "origin_blocked"},
            )
        return await call_next(request)
