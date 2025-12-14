from __future__ import annotations

import json
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from ..context.request_context import get_request_context, set_request_context


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """
    Production-grade structured logging middleware.

    Logs:
    - request_id
    - user_id (if authenticated)
    - auth_type (jwt | api_key | anonymous)
    - method, path, status
    - latency
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())

        # Store request_id immediately
        set_request_context(request_id=request_id)

        start = time.time()
        status_code = 500
        error_msg = None

        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            response.headers["x-request-id"] = request_id
            return response
        except Exception as e:
            error_msg = str(e)
            raise
        finally:
            latency_ms = int((time.time() - start) * 1000)

            ctx = get_request_context()

            log = {
                "ts": int(time.time()),
                "request_id": ctx.get("request_id"),
                "user_id": ctx.get("user_id"),
                "auth_type": ctx.get("auth_type") or "anonymous",
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query) if request.url.query else "",
                "status": status_code,
                "latency_ms": latency_ms,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
                "error": error_msg,
            }

            # JSON logs = cloud-friendly (GCP, AWS, Fly.io, Datadog)
            print(json.dumps(log, ensure_ascii=False))
