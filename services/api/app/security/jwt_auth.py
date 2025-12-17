from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from jose import JWTError, jwt
from passlib.context import CryptContext

from ..config import settings
from .password_policy import PasswordPolicyError, validate_password_policy

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    validate_password_policy(password)
    # Use the raw string (NOT truncated) after validation
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    # Validate max bytes to avoid bcrypt raising
    try:
        validate_password_policy(password)
    except PasswordPolicyError:
        # If password is invalid length, treat as wrong credentials
        return False
    return pwd_context.verify(password, hashed)


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
