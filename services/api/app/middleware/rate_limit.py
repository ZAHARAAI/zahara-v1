import logging
import time

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from ..config import settings
from ..database import get_redis

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app, requests_per_minute: int = None, window_seconds: int = None
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute or settings.rate_limit_requests
        self.window_seconds = window_seconds or settings.rate_limit_window
        self.redis_client = get_redis()

    def _get_api_key_from_request(self, request: Request) -> str:
        """Extract API key from request headers"""
        # Check Authorization header (Bearer token)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]  # Remove "Bearer " prefix

        # Check X-API-Key header
        api_key = request.headers.get("x-api-key", "")
        if api_key:
            return api_key

        return None

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address (fallback for rate limiting)"""
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.headers.get("x-real-ip", "")
        if not client_ip:
            client_ip = request.client.host if request.client else "unknown"
        return client_ip

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for certain paths
        skip_paths = ["/health", "/docs", "/openapi.json", "/static/"]
        if any(request.url.path.startswith(path) for path in skip_paths):
            return await call_next(request)

        # Get API key from request
        api_key = self._get_api_key_from_request(request)

        # Determine rate limiting key
        if api_key:
            # Primary: Rate limit by API key
            rate_limit_identifier = f"api_key:{api_key}"
        else:
            # Fallback: Rate limit by IP (for unauthenticated requests)
            client_ip = self._get_client_ip(request)
            rate_limit_identifier = f"ip:{client_ip}"

        # Create time-based window key
        current_time = int(time.time())
        window_start = current_time - (current_time % self.window_seconds)
        rate_limit_key = f"rate_limit:{rate_limit_identifier}:{window_start}"

        try:
            # Get current request count
            current_requests = self.redis_client.get(rate_limit_key)
            current_requests = int(current_requests) if current_requests else 0

            # Check if rate limit exceeded
            if current_requests >= self.requests_per_minute:
                logger.warning(f"Rate limit exceeded for {rate_limit_identifier}")
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "Rate limit exceeded",
                        "detail": f"Maximum {self.requests_per_minute} requests per {self.window_seconds} seconds",
                        "rate_limit_type": "api_key" if api_key else "ip",
                    },
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
            response.headers["X-RateLimit-Remaining"] = str(
                max(0, self.requests_per_minute - current_requests - 1)
            )
            response.headers["X-RateLimit-Reset"] = str(
                window_start + self.window_seconds
            )
            response.headers["X-RateLimit-Type"] = "api_key" if api_key else "ip"

            return response

        except Exception as e:
            # If Redis is down, allow the request but log the error
            logger.error(f"Rate limiting error: {e}")
            return await call_next(request)
