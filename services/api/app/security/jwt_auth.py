from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import bcrypt
from jose import JWTError, jwt

from ..config import settings

JWT_ALG = "HS256"


class PasswordPolicyError(ValueError):
    pass


def hash_password(password: str) -> str:
    if not isinstance(password, str):
        raise PasswordPolicyError("Password must be a string")

    password = password.strip()

    password_bytes = password.encode("utf-8")

    if len(password_bytes) > 72:
        raise PasswordPolicyError(
            "Password cannot be longer than 72 bytes (bcrypt limit)."
        )

    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET") or settings.secret_key.get_secret_value()


def create_access_token(
    *,
    subject: str,
    user_id: int,
    expires_minutes: int = 60 * 24 * 7,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expires_minutes)
    payload = {
        "sub": subject,
        "uid": user_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    except JWTError as e:
        raise ValueError("Invalid token") from e
