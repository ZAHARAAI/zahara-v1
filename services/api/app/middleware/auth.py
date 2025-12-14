from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..context.request_context import set_request_context
from ..database import get_db
from ..models.user import User
from ..security.jwt_auth import decode_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Production JWT auth:
      Authorization: Bearer <token>

    Sets request context for logging:
      user_id + auth_type
    """
    auth = (
        request.headers.get("authorization")
        or request.headers.get("Authorization")
        or ""
    )
    if not auth.lower().startswith("bearer "):
        set_request_context(user_id=None, auth_type="anonymous")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
        )

    token = auth.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
        user_id = int(payload.get("uid"))
    except Exception:
        set_request_context(user_id=None, auth_type="anonymous")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        set_request_context(user_id=None, auth_type="anonymous")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
        )

    set_request_context(user_id=user.id, auth_type="jwt")
    return user
