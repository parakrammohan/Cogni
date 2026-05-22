"""WebSocket — live patient state.

URL: `wss://…/api/v1/ws`. Two auth paths:

1. `?ticket=<token>` query param — minted by `POST /auth/ws-ticket`
   over the Vercel-proxied REST path (where the session cookie does
   ride). Single-use, 60-second TTL. This is the path real-app
   browsers use because the session cookie lives on the Vercel
   domain, not on HF Space.
2. `cogni_session` cookie — for same-origin connections (local dev
   hitting the backend directly) where the cookie is on this host.

Patient → topic `patient:<patient_id>` (their own).
Caregiver → every paired patient's topic.

Patient messages have type `patient_state`; the server publishes them
to the patient's topic. Caregivers subscribed to that topic receive
them live.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Cookie, WebSocket, WebSocketDisconnect, status

from app.api.v1.auth import redeem_ws_ticket
from app.config import get_settings
from app.crud import pairing as crud_pair
from app.crud import session as crud_session
from app.crud import user as crud_user
from app.db import session_scope
from app.models.user import UserRole
from app.ws_hub import hub

router = APIRouter(tags=["stream"])
log = logging.getLogger("cogni.stream")

_settings = get_settings()


def _topic(patient_id) -> str:
    return f"patient:{patient_id}"


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    cogni_session: str | None = Cookie(default=None, alias=_settings.session_cookie_name),
    ticket: str | None = None,
) -> None:
    # Two auth paths, in priority order:
    #
    # 1. `?ticket=…` query param. The browser fetches this from
    #    `POST /auth/ws-ticket` via the Vercel-proxied REST path (where the
    #    session cookie does ride), then opens the WS with the ticket.
    #    Single-use, 60s TTL. This is the path real-app browsers use because
    #    the session cookie lives on the Vercel domain, not on HF Space.
    #
    # 2. Direct cookie auth. Works when the WS connection is same-origin to
    #    HF Space (e.g. local dev hitting the backend directly). Kept for
    #    back-compat and dev ergonomics.
    user = None
    if ticket:
        uid = redeem_ws_ticket(ticket)
        if uid is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        async with session_scope() as db:
            user = await crud_user.get_by_id(db, uid)
            if user is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            if user.role == UserRole.patient:
                topics = [_topic(user.id)]
            else:
                pairings = await crud_pair.list_pairings_for_caregiver(db, user.id)
                topics = [_topic(p.patient_id) for p in pairings]
    elif cogni_session:
        async with session_scope() as db:
            found = await crud_session.get_active_with_user(db, cogni_session)
            if found is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            _session_row, user = found
            if user.role == UserRole.patient:
                topics = [_topic(user.id)]
            else:
                pairings = await crud_pair.list_pairings_for_caregiver(db, user.id)
                topics = [_topic(p.patient_id) for p in pairings]
    else:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    # Owner mapping first so any concurrent eviction targets the right socket.
    await hub.register_owner(websocket, str(user.id))
    for t in topics:
        await hub.subscribe(t, websocket)

    # Single-writer enforcement: for patient connections only, register
    # this WS as the canonical writer for the patient's topic. Any
    # previous patient device gets displaced with a polite message +
    # close code 4001 so its UI can show a "use this device instead"
    # banner. Caregivers don't go through this — multiple caregiver
    # subscribers are desirable.
    if user.role == UserRole.patient:
        displaced = await hub.claim_patient_writer(str(user.id), websocket)
        if displaced is not None:
            try:
                await displaced.send_text(
                    json.dumps(
                        {
                            "type": "displaced",
                            "reason": (
                                "Another device just became the primary monitor "
                                "for this patient."
                            ),
                        }
                    )
                )
                await displaced.close(code=4001, reason="Displaced by newer device")
            except Exception:
                # Best-effort. If the previous socket was already
                # half-closed, dropping it is fine.
                pass

    # Hello frame so the client knows we're live.
    await websocket.send_text(
        json.dumps(
            {
                "type": "hello",
                "role": user.role.value,
                "user_id": str(user.id),
                "subscribed": topics,
            }
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            await _handle_inbound(raw, user)
    except WebSocketDisconnect:
        pass
    finally:
        if user.role == UserRole.patient:
            await hub.release_patient_writer(str(user.id), websocket)
        await hub.unsubscribe_all(websocket)


async def _handle_inbound(raw: str, user) -> None:
    """Patients are allowed to publish `patient_state`; everything else
    is silently dropped. Caregivers don't publish at all in MVP."""
    if user.role != UserRole.patient:
        return
    try:
        msg: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        return
    if msg.get("type") != "patient_state":
        return
    payload = {
        "type": "patient_state",
        "patient_id": str(user.id),
        "data": msg.get("data", {}),
        "ts": msg.get("ts"),
    }
    await hub.publish(_topic(user.id), payload)
