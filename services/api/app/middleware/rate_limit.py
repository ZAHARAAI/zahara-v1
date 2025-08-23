import time

from fastapi import Request, status
from fastapi.responses import JSONResponse

from ..config import settings
from ..database import get_redis


class RateLimitMiddleware:
    def __init__(self, requests_per_minute: int = None, window_seconds: int = None):
        self.requests_per_minute = requests_per_minute or settings.rate_limit_requests
        self.window_seconds = window_seconds or settings.rate_limit_window
        self.redis_client = get_redis()

    async def __call__(self, request: Request, call_next):
        # Get client IP (handle proxy headers)
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.headers.get("x-real-ip", "")
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"

        # Create rate limit key
        current_time = int(time.time())
        window_start = current_time - (current_time % self.window_seconds)
        rate_limit_key = f"rate_limit:{client_ip}:{window_start}"

        try:
            # Get current request count
            current_requests = self.redis_client.get(rate_limit_key)
            current_requests = int(current_requests) if current_requests else 0

            # Check if rate limit exceeded
            if current_requests >= self.requests_per_minute:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "Rate limit exceeded",
                        "detail": f"Maximum {self.requests_per_minute} requests per {self.window_seconds} seconds"
                    }
                )

            # Increment request count
            pipe = self.redis_client.pipeline()
            pipe.incr(rate_limit_key)
            pipe.expire(rate_limit_key, self.window_seconds)
            pipe.execute()

            # Process request
            response = await call_next(request)

            # Add rate limit headers
            response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
            response.headers["X-RateLimit-Remaining"] = str(max(0, self.requests_per_minute - current_requests - 1))
            response.headers["X-RateLimit-Reset"] = str(window_start + self.window_seconds)

            return response

        except Exception as e:
            # If Redis is down, allow the request but log the error
            print(f"Rate limiting error: {e}")
            return await call_next(request)
