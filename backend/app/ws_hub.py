"""In-process WebSocket pub/sub.

A single-process design: every topic maps to a set of connected
`WebSocket` instances, and `publish()` fans out to each socket. Good
enough for one HF Space replica; documented as a known limitation in
`docs/backend.md` (scaling beyond one process needs Redis Pub/Sub).
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("cogni.ws")


class WsHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, topic: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subs[topic].add(ws)

    async def unsubscribe(self, topic: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subs[topic].discard(ws)
            if not self._subs[topic]:
                self._subs.pop(topic, None)

    async def unsubscribe_all(self, ws: WebSocket) -> None:
        async with self._lock:
            for topic in list(self._subs.keys()):
                self._subs[topic].discard(ws)
                if not self._subs[topic]:
                    self._subs.pop(topic, None)

    async def publish(self, topic: str, payload: dict[str, Any]) -> int:
        """Fan-out to every subscriber on `topic`. Returns count delivered.

        Dead connections (closed sockets) are pruned lazily on send failure.
        """
        async with self._lock:
            targets = list(self._subs.get(topic, ()))
        text = json.dumps(payload, separators=(",", ":"))
        delivered = 0
        for ws in targets:
            try:
                await ws.send_text(text)
                delivered += 1
            except Exception:
                # Best-effort cleanup; the connection's own handler will
                # eventually call unsubscribe_all on close anyway.
                await self.unsubscribe_all(ws)
        return delivered


hub = WsHub()
