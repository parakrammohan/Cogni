"""Tiny in-process rate limiter.

Keyed by an opaque string (e.g. `redeem:<user_id>` or `redeem:ip:<addr>`).
A sliding window with a fixed event budget: ≤ `limit` events allowed
within the last `window_seconds`. Returns True if the call is allowed
(and records it), False if it should be rejected.

Single-process by design — fine for one HF Space replica. Migrating to
Redis is a few-line swap once we scale out.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock
from typing import Deque

_LOCK = Lock()
_BUCKETS: dict[str, Deque[float]] = {}


def allow(key: str, *, limit: int, window_seconds: float) -> bool:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _LOCK:
        bucket = _BUCKETS.setdefault(key, deque(maxlen=limit + 1))
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True
