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
    # token = request.headers.get("x-jwt-token")
    # try:
    #     payload = decode_token(token.strip())
    #     user_id = int(payload.get("uid"))
    # except Exception:
    #     set_request_context(user_id=None, auth_type="anonymous")
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
    #     )

    # user = db.query(User).filter(User.id == user_id).first()
    # if not user:
    #     set_request_context(user_id=None, auth_type="anonymous")
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized"
    #     )

    # set_request_context(user_id=user.id, auth_type="jwt")
    # # return user
    # return CurrentUser(id=user_id)

    return CurrentUser(id=1)
