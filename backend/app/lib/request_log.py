"""Lightweight in-memory request log for the admin dashboard.

Captures method, path (with UUID-looking segments masked), status, and
duration into a bounded ring buffer. PII-free by design: no request
bodies, no query strings, no headers. Lost on restart, single-process —
swap for proper structured logging when you outgrow it.
"""

from __future__ import annotations

import re
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

# UUID-shaped segments and long hexadecimal tokens get masked so paths
# don't leak per-user identifiers when scrolling the log.
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
_LONG_HEX = re.compile(r"\b[0-9a-f]{16,}\b", re.I)


def _mask(path: str) -> str:
    path = _UUID.sub(":id", path)
    path = _LONG_HEX.sub(":hex", path)
    return path


@dataclass
class LogEntry:
    ts: str
    method: str
    path: str
    status: int
    ms: int


class RequestRing:
    def __init__(self, capacity: int = 200) -> None:
        self._buf: Deque[LogEntry] = deque(maxlen=capacity)
        self._lock = Lock()

    def add(self, entry: LogEntry) -> None:
        with self._lock:
            self._buf.append(entry)

    def snapshot(self) -> list[LogEntry]:
        with self._lock:
            return list(self._buf)[::-1]  # newest first


ring = RequestRing()


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip admin's own pages and /docs to keep the feed signal-rich.
        path = request.url.path
        if path.startswith("/admin") or path.startswith("/docs") or path == "/openapi.json":
            return await call_next(request)

        started = time.monotonic()
        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        finally:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            status = response.status_code if response is not None else 500
            ring.add(
                LogEntry(
                    ts=datetime.now(timezone.utc).isoformat(),
                    method=request.method,
                    path=_mask(path),
                    status=status,
                    ms=elapsed_ms,
                )
            )
