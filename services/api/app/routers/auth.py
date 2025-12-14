from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.user import User
from ..security.jwt_auth import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    ok: bool = True
    access_token: str
    token_type: str = "bearer"
    user: dict


class MeResponse(BaseModel):
    ok: bool = True
    user: dict


def _user_public(u: User) -> dict:
    return {"id": u.id, "email": u.email}


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.strip().lower()

    exists = db.query(User).filter(User.email == email).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "ok": False,
                "error": {
                    "code": "EMAIL_EXISTS",
                    "message": "Email already registered.",
                },
            },
        )

    u = User(email=email, hashed_password=hash_password(body.password))
    db.add(u)
    db.commit()
    db.refresh(u)

    token = create_access_token(subject=u.email, user_id=u.id)
    return AuthResponse(ok=True, access_token=token, user=_user_public(u))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.strip().lower()

    u = db.query(User).filter(User.email == email).first()
    if not u or not verify_password(body.password, u.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "ok": False,
                "error": {
                    "code": "INVALID_CREDENTIALS",
                    "message": "Invalid email or password.",
                },
            },
        )

    token = create_access_token(subject=u.email, user_id=u.id)
    return AuthResponse(ok=True, access_token=token, user=_user_public(u))


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(ok=True, user=_user_public(current_user))
