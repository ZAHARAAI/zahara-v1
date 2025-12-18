from __future__ import annotations

import logging
import time

from fastapi import Depends, HTTPException, status

from ..config import settings
from ..database import get_redis
from ..middleware.auth import get_current_user
from ..models.user import User

logger = logging.getLogger(__name__)

_LUA_INCR_EXPIRE = """
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
"""


def _key(user_id: int, window_start: int) -> str:
    return f"rate_limit:run:user:{user_id}:{window_start}"


def enforce_run_start_rate_limit(
    current_user: User = Depends(get_current_user),
) -> None:
    """
    rate limit — ONLY for starting runs.

    Applied explicitly via Depends() on:
      POST /agents/{id}/run

    Never used as global middleware.
    """
    limit = int(getattr(settings, "rate_limit_requests", 60))
    window = int(getattr(settings, "rate_limit_window", 60))

    if limit <= 0 or window <= 0:
        return

    now = int(time.time())
    window_start = now - (now % window)
    key = _key(current_user.id, window_start)

    try:
        r = get_redis()
        count, ttl = r.eval(_LUA_INCR_EXPIRE, 1, key, window)
        count = int(count)
        ttl = int(ttl or window)

        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "ok": False,
                    "error": {
                        "code": "RATE_LIMITED",
                        "error": "rate_limited",
                        "message": "Run rate limit exceeded.",
                        "limit": limit,
                        "window_seconds": window,
                        "retry_after_seconds": ttl,
                    },
                },
                headers={"Retry-After": str(ttl)},
            )

    except HTTPException:
        raise
    except Exception as e:
        # Fail open — do not block runs if Redis is down
        logger.error("Run rate limit failed (allowing request): %s", e)
        return
