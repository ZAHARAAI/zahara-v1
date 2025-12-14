from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

# ContextVars are async-safe and worker-safe
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[Optional[int]] = ContextVar("user_id", default=None)
auth_type_ctx: ContextVar[Optional[str]] = ContextVar("auth_type", default=None)


def set_request_context(
    *,
    request_id: Optional[str] = None,
    user_id: Optional[int] = None,
    auth_type: Optional[str] = None,
) -> None:
    if request_id is not None:
        request_id_ctx.set(request_id)
    if user_id is not None:
        user_id_ctx.set(user_id)
    if auth_type is not None:
        auth_type_ctx.set(auth_type)


def get_request_context() -> dict:
    return {
        "request_id": request_id_ctx.get(),
        "user_id": user_id_ctx.get(),
        "auth_type": auth_type_ctx.get(),
    }
