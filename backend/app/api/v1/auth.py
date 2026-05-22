"""Auth routes: /signup, /login, /logout, /me.

Sessions are opaque random tokens stored in Postgres and transported
via HttpOnly+Secure cookies (`cogni_session`). No JWT, no JWT_SECRET,
instant revocation by deleting the session row.
"""

from __future__ import annotations

import secrets
import time
import uuid
from threading import Lock

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.crud import pairing as crud_pair
from app.crud import session as crud_session
from app.crud import user as crud_user
from app.deps import CurrentUser, DbDep
from app.lib.errors import AuthError, ConflictError, ValidationError_
from app.schemas.auth import (
    ChangePasswordIn,
    DeleteAccountIn,
    LoginIn,
    MeUpdateIn,
    SignupIn,
    UserOut,
)
from app.security import hash_password, password_needs_rehash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_settings = get_settings()

# Pre-computed Argon2id hash of an unguessable throwaway string. We run
# verify_password against this on missing-username login attempts so that
# the wall-clock latency of a "no such user" response matches a "wrong
# password" response — closes the timing-side-channel that would
# otherwise let an attacker enumerate registered usernames.
_DUMMY_PASSWORD_HASH = hash_password("not-a-real-password-just-for-timing-parity")

# ---- WS ticket auth ------------------------------------------------------
#
# The browser session cookie is set on the Vercel proxy host (cogni-steel
# .vercel.app), not on the HF Space host. WebSocket upgrades go directly to
# wss://cogni-team-cogni.hf.space and are cross-origin from Vercel — so the
# session cookie isn't sent on the upgrade and the server can't authenticate.
#
# The standard workaround is a short-lived ticket. The browser POSTs to
# `/auth/ws-ticket` via the proxied REST path (where the cookie does ride),
# receives a single-use random token, then opens
# `wss://.../ws?ticket=<token>`. The WS endpoint validates the ticket once,
# discards it, and proceeds as if it had a cookie.
#
# Tickets live in-process. HF Space single-replica makes this fine; on
# restart all tickets vanish and clients re-fetch on the next reconnect.
_TICKET_TTL_SECONDS = 60
_tickets: dict[str, tuple[uuid.UUID, float]] = {}
_tickets_lock = Lock()


def _gc_tickets(now: float) -> None:
    """Drop expired tickets. Called inside the lock at mint + redeem."""
    for tkt, (_, expires) in list(_tickets.items()):
        if expires <= now:
            _tickets.pop(tkt, None)


def mint_ws_ticket(user_id: uuid.UUID) -> tuple[str, int]:
    """Mint a single-use ticket bound to `user_id`. Returns (token, ttl)."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _tickets_lock:
        _gc_tickets(now)
        _tickets[token] = (user_id, now + _TICKET_TTL_SECONDS)
    return token, _TICKET_TTL_SECONDS


def redeem_ws_ticket(token: str) -> uuid.UUID | None:
    """Atomically claim a ticket. Returns the bound user_id, or None if
    the ticket is unknown / expired. Single-use: a successful redemption
    deletes the entry so a stolen ticket can't be replayed."""
    if not token:
        return None
    now = time.time()
    with _tickets_lock:
        _gc_tickets(now)
        entry = _tickets.pop(token, None)
    if entry is None:
        return None
    user_id, expires = entry
    if expires <= now:
        return None
    return user_id


class WsTicketOut(BaseModel):
    ticket: str
    expires_in: int


def _set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=_settings.session_cookie_name,
        value=raw_token,
        max_age=_settings.session_ttl_seconds,
        httponly=True,
        secure=_settings.session_cookie_secure,
        samesite=_settings.session_cookie_samesite,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=_settings.session_cookie_name,
        path="/",
        secure=_settings.session_cookie_secure,
        httponly=True,
        samesite=_settings.session_cookie_samesite,
    )


def _client_ip(request: Request) -> str | None:
    """Resolve the originating client IP, preferring the leftmost hop of
    `X-Forwarded-For` when present. HF Spaces sits behind a reverse proxy
    that sets this header — `request.client.host` would otherwise always
    be the proxy's internal IP and make the stored `ip_address` field
    useless for any "active devices" / abuse-throttling UI."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else None


async def _issue_session(
    db,
    response: Response,
    request: Request,
    user_id,
) -> None:
    raw, _row = await crud_session.create(
        db,
        user_id=user_id,
        ttl_seconds=_settings.session_ttl_seconds,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    _set_session_cookie(response, raw)


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupIn, db: DbDep, request: Request, response: Response) -> UserOut:
    if await crud_user.get_by_username(db, payload.username):
        raise ConflictError(f"Username '{payload.username}' is taken.")

    try:
        user = await crud_user.create(
            db,
            username=payload.username,
            password=payload.password,
            role=payload.role,
            display_name=payload.display_name,
        )
        await db.flush()
    except IntegrityError:
        # Lost a race with another signup using the same username.
        await db.rollback()
        raise ConflictError(f"Username '{payload.username}' is taken.")

    # Any new account with an invite_code is immediately paired with
    # whoever generated it (subject to the opposite-role rule). We wrap
    # the redeem in a SAVEPOINT so its failure rolls back only the pairing
    # attempt — the user row + session row survive. Without the savepoint
    # an invite-code race would also blow away the just-created user.
    if payload.invite_code:
        try:
            async with db.begin_nested():
                await crud_pair.redeem(db, code=payload.invite_code, redeemer=user)
        except Exception:
            pass

    await _issue_session(db, response, request, user.id)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, db: DbDep, request: Request, response: Response) -> UserOut:
    user = await crud_user.get_by_username(db, payload.username)
    if user is None:
        # Constant-time parity: run verify_password against a dummy hash
        # so a "no such user" response takes the same Argon2 wall-clock
        # as a "wrong password" response. Closes the timing oracle that
        # would otherwise let attackers enumerate registered usernames.
        verify_password(payload.password, _DUMMY_PASSWORD_HASH)
        raise AuthError("Invalid username or password")
    if not verify_password(payload.password, user.password_hash):
        raise AuthError("Invalid username or password")

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        await db.flush()

    await _issue_session(db, response, request, user.id)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(db: DbDep, request: Request, response: Response) -> Response:
    cookie = request.cookies.get(_settings.session_cookie_name)
    if cookie:
        await crud_session.delete_by_token(db, cookie)
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/logout-everywhere", status_code=status.HTTP_204_NO_CONTENT)
async def logout_everywhere(
    current_user: CurrentUser, db: DbDep, response: Response
) -> Response:
    await crud_session.delete_for_user(db, current_user.id)
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/ws-ticket", response_model=WsTicketOut)
async def ws_ticket(current_user: CurrentUser) -> WsTicketOut:
    """Mint a short-lived ticket the browser can use to authenticate the
    WebSocket upgrade.

    The session cookie is set on the Vercel proxy host, not on the HF Space,
    so the WS upgrade (cross-origin to HF) doesn't carry it. The frontend
    fetches this ticket via the proxied REST path (where the cookie IS sent),
    then opens `wss://…/api/v1/ws?ticket=<token>`. The WS endpoint redeems
    the ticket once and proceeds.
    """
    token, ttl = mint_ws_ticket(current_user.id)
    return WsTicketOut(ticket=token, expires_in=ttl)


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: MeUpdateIn, current_user: CurrentUser, db: DbDep
) -> UserOut:
    """Update the signed-in user's own username and/or display_name.
    Username changes are checked against the unique index — a clash
    returns 409 conflict so the client can show a useful error."""
    if payload.username is None and payload.display_name is None:
        raise ValidationError_("Nothing to update.")

    if payload.username and payload.username != current_user.username:
        clash = await crud_user.get_by_username(db, payload.username)
        if clash is not None and clash.id != current_user.id:
            raise ConflictError(f"Username '{payload.username}' is taken.")
        current_user.username = payload.username

    if payload.display_name is not None:
        current_user.display_name = payload.display_name.strip()

    if payload.photo_url is not None:
        # Empty string is a valid "remove the photo" sentinel; non-empty
        # values are accepted verbatim (data URL or remote URL).
        current_user.photo_url = payload.photo_url

    try:
        await db.flush()
    except IntegrityError:
        # Lost a race with a concurrent username change to the same
        # target — DB UNIQUE caught it. Surface a clean 409 instead of
        # letting the IntegrityError bubble into a 500.
        await db.rollback()
        raise ConflictError(f"Username '{payload.username}' is taken.")
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/change-password", response_model=UserOut)
async def change_password(
    payload: ChangePasswordIn,
    current_user: CurrentUser,
    db: DbDep,
    request: Request,
    response: Response,
) -> UserOut:
    """Verify the current password, then store the new Argon2id hash.
    On success every existing session for this user is revoked (including
    the one that made this request) and a fresh session is issued to the
    caller via Set-Cookie — so a leaked / unauthorised device is kicked
    out while the caller stays signed in on this device."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise AuthError("Current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise ValidationError_("New password must be different from the current one.")
    current_user.password_hash = hash_password(payload.new_password)
    await db.flush()

    # Kill every existing session for this user, then mint a fresh one
    # tied to the new password. Effectively a 'sign everyone else out'.
    await crud_session.delete_for_user(db, current_user.id)
    await _issue_session(db, response, request, current_user.id)
    return UserOut.model_validate(current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    payload: DeleteAccountIn,
    current_user: CurrentUser,
    db: DbDep,
    response: Response,
) -> Response:
    """Permanently delete the caller's account.

    Requires the current password AND a typed username confirmation as
    a fat-finger defence. Every domain table FKs `users.id` with
    ON DELETE CASCADE, so a single delete on `users` drops the
    profile, contacts, reminders, memories, game sessions, pursuit
    results, alerts, geofence zones/settings, screening results, and
    every existing session in one statement.

    Pairing rows also cascade on both `caregiver_id` and `patient_id`,
    so deleting a caregiver auto-unpairs the patient (the patient
    account itself is NOT deleted — they keep their own data and can
    pair with a new caregiver). Symmetric for patient self-delete.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        raise AuthError("Current password is incorrect.")
    if payload.username_confirmation != current_user.username:
        raise ValidationError_(
            "Type your username exactly to confirm account deletion.",
        )
    await db.delete(current_user)
    await db.flush()
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
