from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status  # noqa: F401
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..context.request_context import set_request_context  # noqa: F401
from ..database import get_db
from ..models.user import User
from ..security.jwt_auth import decode_token  # noqa: F401


class CurrentUser(BaseModel):
    id: int


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Extract and validate JWT token from Authorization header."""
    auth_header = request.headers.get("authorization", "").strip()
    if not auth_header.startswith("Bearer "):
        set_request_context(user_id=None, auth_type="anonymous")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = auth_header[7:]  # Remove "Bearer " prefix
    try:
        payload = decode_token(token)
        user_id = int(payload.get("uid"))
    except (ValueError, KeyError, TypeError) as e:
        set_request_context(user_id=None, auth_type="anonymous")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        ) from e

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        set_request_context(user_id=None, auth_type="anonymous")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    set_request_context(user_id=user.id, auth_type="jwt")
    return user
