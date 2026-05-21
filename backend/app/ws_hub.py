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
        # Reverse map socket → owning user id. Needed so we can target a
        # specific caregiver's subscriptions for eviction when a pairing
        # breaks (otherwise stale subscriptions outlive the unpair and
        # leak patient state to the ex-caregiver until the socket dies).
        self._owners: dict[WebSocket, str] = {}
        # Single-writer-per-patient registry. When two patient devices
        # connect simultaneously the second one claims the slot and the
        # first one is "displaced" — the caller in stream.py sends it a
        # polite message + closes with code 4001. Caregivers don't go
        # in this registry; they're consumers, multiple subscribers are
        # fine and desirable.
        self._patient_writers: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def register_owner(self, ws: WebSocket, user_id: str) -> None:
        async with self._lock:
            self._owners[ws] = user_id

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
            self._owners.pop(ws, None)
            # Also clear any patient-writer claims this socket held.
            for pid, claim in list(self._patient_writers.items()):
                if claim is ws:
                    self._patient_writers.pop(pid, None)

    async def evict_user_from_topic(self, user_id: str, topic: str) -> int:
        """Drop every subscription on `topic` held by sockets owned by
        `user_id`. Called when a pairing breaks so a caregiver stops
        receiving the ex-patient's state without waiting for the socket
        to die naturally.

        Returns the number of subscriptions removed."""
        async with self._lock:
            subs = self._subs.get(topic)
            if not subs:
                return 0
            removed: list[WebSocket] = [ws for ws in subs if self._owners.get(ws) == user_id]
            for ws in removed:
                subs.discard(ws)
            if not subs:
                self._subs.pop(topic, None)
        # Best-effort notice — caregivers' UIs can react if they care.
        for ws in removed:
            try:
                await ws.send_text(
                    '{"type":"unsubscribed","topic":' + json.dumps(topic) + ',"reason":"pairing_broken"}'
                )
            except Exception:
                pass
        return len(removed)

    async def claim_patient_writer(self, patient_id: str, ws: WebSocket) -> WebSocket | None:
        """Atomically replace the previous writer for `patient_id` with `ws`.

        Returns the displaced WebSocket (if any) so the caller can send
        it a "displaced" message and close it. Returns None if `ws` was
        already the writer or this is the first claim.
        """
        async with self._lock:
            previous = self._patient_writers.get(patient_id)
            self._patient_writers[patient_id] = ws
            return previous if previous is not None and previous is not ws else None

    async def release_patient_writer(self, patient_id: str, ws: WebSocket) -> None:
        """Drop `ws` from the writer registry if and only if it's still
        the current writer. Lets a graceful close clean up without
        clobbering a fresher connection that already replaced it."""
        async with self._lock:
            if self._patient_writers.get(patient_id) is ws:
                self._patient_writers.pop(patient_id, None)

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
