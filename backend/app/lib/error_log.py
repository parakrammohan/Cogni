"""Lightweight in-memory error log for the admin dashboard.

The catch-all FastAPI exception handler in `app.lib.errors` already
writes tracebacks to the `cogni.errors` logger, which goes to the HF
Space's stderr. That's great for postmortem but useless when you're
debugging a 500 from a phone — you can't tail logs from there.

This module attaches a `logging.Handler` to the relevant loggers
(`cogni.errors`, `cogni.ml.tabular`, `cogni.ml.mri`, root) that
captures each ERROR-level record into a small ring buffer alongside
its formatted traceback. The admin dashboard reads `/admin/errors.json`
and renders the most recent N entries so operators can see *what*
500'd without ssh-ing into the Space.

PII discipline: we capture the logger's formatted message + the
exception traceback. The traceback may include SQLAlchemy bound
parameters (which is why the API never echoes raw exceptions to
clients). The admin dashboard is operator-gated by ADMIN_PASSWORD,
so it's an acceptable surface — but DO NOT bolt this onto any
public endpoint.
"""

from __future__ import annotations

import logging
import traceback as tb_mod
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Deque


@dataclass
class ErrorEntry:
    ts: str
    logger: str
    level: str
    message: str
    traceback: str | None


class ErrorRing:
    def __init__(self, capacity: int = 50) -> None:
        self._buf: Deque[ErrorEntry] = deque(maxlen=capacity)
        self._lock = Lock()

    def add(self, entry: ErrorEntry) -> None:
        with self._lock:
            self._buf.append(entry)

    def snapshot(self) -> list[ErrorEntry]:
        with self._lock:
            return list(self._buf)[::-1]  # newest first


ring = ErrorRing()


class _RingHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover — defensive
            message = "<formatting error>"
        traceback_str: str | None = None
        if record.exc_info:
            traceback_str = "".join(tb_mod.format_exception(*record.exc_info))
        ring.add(
            ErrorEntry(
                ts=datetime.now(timezone.utc).isoformat(),
                logger=record.name,
                level=record.levelname,
                message=message,
                traceback=traceback_str,
            )
        )


def install() -> None:
    """Attach the ring handler to the root logger at ERROR level.
    Idempotent — safe to call multiple times during reloads."""
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, _RingHandler):
            return
    handler = _RingHandler(level=logging.ERROR)
    root.addHandler(handler)
