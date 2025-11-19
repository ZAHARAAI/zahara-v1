import os

from fastapi import Header, HTTPException

DEMO_TOKEN = os.getenv("DEMO_TOKEN", "zahara-demo-123")


def check_auth(
    authorization: str | None = Header(None), x_api_key: str | None = Header(None)
) -> str:
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
    if not token and x_api_key:
        token = x_api_key.strip()
    if not token or token != DEMO_TOKEN:
        raise HTTPException(
            status_code=401,
            detail={
                "ok": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Invalid or missing API key",
                },
            },
        )
    return token
