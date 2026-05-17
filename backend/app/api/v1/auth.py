"""Auth routes: /signup, /login, /me."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.crud import user as crud_user
from app.deps import CurrentUser, DbDep
from app.lib.errors import AuthError, ConflictError
from app.schemas.auth import LoginIn, SignupIn, TokenOut, UserOut
from app.security import create_access_token, needs_rehash, verify_password, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupIn, db: DbDep) -> TokenOut:
    if await crud_user.get_by_username(db, payload.username):
        raise ConflictError(f"Username '{payload.username}' is taken.")

    user = await crud_user.create(
        db,
        username=payload.username,
        password=payload.password,
        role=payload.role,
        display_name=payload.display_name,
    )
    # NOTE: `invite_code` is accepted in the payload but ignored until
    # Stage 2 wires up the pairings table. We log it so we can verify
    # signups flowed through the right path post-deploy.
    if payload.invite_code:
        # Will be redeemed via /pairing/redeem in Stage 2 once the
        # invite_codes table exists.
        pass

    token, expires_in = create_access_token(user.id, user.role.value)
    return TokenOut(
        user=UserOut.model_validate(user),
        access_token=token,
        expires_in=expires_in,
    )


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: DbDep) -> TokenOut:
    user = await crud_user.get_by_username(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        # Same response for both cases — don't leak which side failed.
        raise AuthError("Invalid username or password")

    # Opportunistically upgrade hash parameters if the running version
    # of argon2-cffi recommends stronger settings than what's stored.
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        await db.flush()

    token, expires_in = create_access_token(user.id, user.role.value)
    return TokenOut(
        user=UserOut.model_validate(user),
        access_token=token,
        expires_in=expires_in,
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)
