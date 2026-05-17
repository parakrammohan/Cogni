"""Auth routes: /signup, /login, /logout, /me.

Sessions are opaque random tokens stored in Postgres and transported
via HttpOnly+Secure cookies (`cogni_session`). No JWT, no JWT_SECRET,
instant revocation by deleting the session row.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.config import get_settings
from app.crud import session as crud_session
from app.crud import user as crud_user
from app.deps import CurrentUser, DbDep
from app.lib.errors import AuthError, ConflictError
from app.schemas.auth import LoginIn, SignupIn, UserOut
from app.security import hash_password, password_needs_rehash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_settings = get_settings()


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
        ip_address=request.client.host if request.client else None,
    )
    _set_session_cookie(response, raw)


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupIn, db: DbDep, request: Request, response: Response) -> UserOut:
    if await crud_user.get_by_username(db, payload.username):
        raise ConflictError(f"Username '{payload.username}' is taken.")

    user = await crud_user.create(
        db,
        username=payload.username,
        password=payload.password,
        role=payload.role,
        display_name=payload.display_name,
    )
    # NOTE: invite_code is accepted but ignored until Stage 2 lands the
    # pairings table.
    if payload.invite_code:
        pass

    await _issue_session(db, response, request, user.id)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, db: DbDep, request: Request, response: Response) -> UserOut:
    user = await crud_user.get_by_username(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        # Identical 401 on either failure mode — no username enumeration.
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
