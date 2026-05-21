"""WebSocket — live patient state.

URL: `wss://…/api/v1/ws`. Auth is the same `cogni_session` cookie
browsers send on every upgrade request (SameSite=None+Secure makes
that work cross-origin too). No `?token=` query param needed.

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

from app.config import get_settings
from app.crud import pairing as crud_pair
from app.crud import session as crud_session
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
) -> None:
    if not cogni_session:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Resolve session → user → topic list. Use a short-lived async
    # session for the auth + pairing lookup, then close it. The socket
    # itself doesn't hold a DB connection.
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
