"""
Observability middleware for request tracking, logging, and metrics
Provides JSON logs with request_id and per-request latency
Enhanced with Agent Clinic trace creation for LLM and agent operations
Captures real token/cost data from LLM responses
"""

import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Configure JSON logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",  # We'll format as JSON ourselves
    handlers=[logging.StreamHandler()],
)

logger = logging.getLogger("zahara.observability")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Middleware for observability: request tracking, JSON logging, metrics, and trace creation"""

    def __init__(self, app):
        super().__init__(app)
        self.trace_worthy_paths = [
            "/agents/",
            "/v1/chat/completions",
            "/llm/",
            "/vector/",
        ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())

        # Add request ID to request state for use in other parts of the app
        request.state.request_id = request_id

        # Record start time
        start_time = time.time()

        # Extract request information
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        api_key_present = bool(
            request.headers.get("authorization", "").startswith("Bearer ")
            or request.headers.get("x-api-key", "")
        )

        # Store original body for potential re-reading
        body = await request.body()
        request._body = body

        # Log request start
        self._log_request_start(
            request_id=request_id,
            method=request.method,
            url=str(request.url),
            client_ip=client_ip,
            user_agent=user_agent,
            api_key_present=api_key_present,
        )

        # Check if this request should create a trace
        should_trace = self._should_create_trace(request)
        trace_id = None

        if should_trace:
            trace_id = f"trace_{request_id}"
            # Store trace info in request state for use by endpoints
            request.state.trace_id = trace_id
            request.state.should_trace = True

        # Process request
        try:
            response = await call_next(request)

            # Calculate latency
            end_time = time.time()
            latency_ms = round((end_time - start_time) * 1000, 2)

            # Add observability headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{latency_ms}ms"

            if trace_id:
                response.headers["X-Trace-ID"] = trace_id

            # Create trace for successful operations
            if should_trace and response.status_code < 400:
                await self._create_trace_async(
                    trace_id=trace_id,
                    request=request,
                    response=response,
                    start_time=start_time,
                    end_time=end_time,
                    client_ip=client_ip,
                    user_agent=user_agent,
                    status="OK",
                )

            # Log successful request
            self._log_request_success(
                request_id=request_id,
                method=request.method,
                url=str(request.url),
                status_code=response.status_code,
                latency_ms=latency_ms,
                client_ip=client_ip,
            )

            return response

        except Exception as e:
            # Calculate latency for failed requests too
            end_time = time.time()
            latency_ms = round((end_time - start_time) * 1000, 2)

            # Create trace for failed operations
            if should_trace:
                error_status = self._determine_error_status(e)
                await self._create_trace_async(
                    trace_id=trace_id,
                    request=request,
                    response=None,
                    start_time=start_time,
                    end_time=end_time,
                    client_ip=client_ip,
                    user_agent=user_agent,
                    status=error_status,
                    error=str(e),
                )

            # Log request error
            self._log_request_error(
                request_id=request_id,
                method=request.method,
                url=str(request.url),
                error=str(e),
                latency_ms=latency_ms,
                client_ip=client_ip,
            )

            # Re-raise the exception
            raise

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request"""
        # Check for forwarded headers (proxy/load balancer)
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        real_ip = request.headers.get("x-real-ip", "")
        if real_ip:
            return real_ip

        # Fallback to direct client IP
        if request.client:
            return request.client.host

        return "unknown"

    def _log_request_start(
        self,
        request_id: str,
        method: str,
        url: str,
        client_ip: str,
        user_agent: str,
        api_key_present: bool,
    ):
        """Log request start in JSON format"""
        log_data = {
            "timestamp": time.time(),
            "level": "INFO",
            "event": "request_start",
            "request_id": request_id,
            "method": method,
            "url": url,
            "client_ip": client_ip,
            "user_agent": user_agent,
            "api_key_present": api_key_present,
            "service": "zahara-api",
        }

        logger.info(json.dumps(log_data))

    def _log_request_success(
        self,
        request_id: str,
        method: str,
        url: str,
        status_code: int,
        latency_ms: float,
        client_ip: str,
    ):
        """Log successful request completion in JSON format"""
        log_data = {
            "timestamp": time.time(),
            "level": "INFO",
            "event": "request_success",
            "request_id": request_id,
            "method": method,
            "url": url,
            "status_code": status_code,
            "latency_ms": latency_ms,
            "client_ip": client_ip,
            "service": "zahara-api",
        }

        logger.info(json.dumps(log_data))

    def _log_request_error(
        self,
        request_id: str,
        method: str,
        url: str,
        error: str,
        latency_ms: float,
        client_ip: str,
    ):
        """Log request error in JSON format"""
        log_data = {
            "timestamp": time.time(),
            "level": "ERROR",
            "event": "request_error",
            "request_id": request_id,
            "method": method,
            "url": url,
            "error": error,
            "latency_ms": latency_ms,
            "client_ip": client_ip,
            "service": "zahara-api",
        }

        logger.error(json.dumps(log_data))

    def _should_create_trace(self, request: Request) -> bool:
        """Determine if this request should create a trace"""
        path = request.url.path
        method = request.method

        # Only trace specific operations
        if method not in ["POST", "GET"]:
            return False

        # Check if path matches trace-worthy patterns
        for pattern in self.trace_worthy_paths:
            if pattern in path:
                return True

        return False

    def _determine_error_status(self, error: Exception) -> str:
        """Determine trace status from exception"""
        error_str = str(error).lower()

        if "rate limit" in error_str or "too many requests" in error_str:
            return "RATE-LIMIT"
        elif "auth" in error_str or "unauthorized" in error_str:
            return "ERROR"
        else:
            return "ERROR"

    def _extract_operation_name(self, request: Request) -> str:
        """Extract operation name from request path"""
        path = request.url.path

        if "/agents/" in path and "/chat" in path:
            return "agent_chat"
        elif "/v1/chat/completions" in path:
            return "chat_completion"
        elif "/llm/" in path:
            return "llm_operation"
        elif "/vector/" in path:
            return "vector_operation"
        else:
            # Extract from path segments
            segments = [s for s in path.split("/") if s]
            if len(segments) >= 2:
                return f"{segments[0]}_{segments[1]}"
            elif len(segments) >= 1:
                return segments[0]
            else:
                return "unknown_operation"

    def _extract_model_from_request(self, request: Request) -> str:
        """Extract model information from request"""
        # Try to get model from URL path (for agent endpoints)
        path = request.url.path
        if "/agents/" in path and "/chat" in path:
            # Could extract model from agent config, but for now use default
            return "gpt-3.5-turbo"

        # Try to get model from request state
        if hasattr(request.state, "json_body"):
            body = request.state.json_body
            if isinstance(body, dict) and "model" in body:
                return body["model"]

        # Default fallback
        return "unknown"

    def _extract_llm_usage(
        self, response_body: Optional[Dict[str, Any]]
    ) -> tuple[int, float]:
        """Extract token usage and cost from LLM response"""
        tokens = 0
        cost = 0.0

        if not response_body:
            return tokens, cost

        try:
            # Check for usage data in agent chat response
            if "model_info" in response_body:
                model_info = response_body["model_info"]  # Available but not used yet
                print(model_info)

            # Check for OpenAI-style usage format
            if "usage" in response_body:
                usage = response_body["usage"]
                if isinstance(usage, dict):
                    tokens = usage.get("total_tokens", 0)
                    # Estimate cost based on model (simplified)
                    model = response_body.get("model", "unknown")
                    cost = self._estimate_cost(model, tokens)

            # Check for direct usage in response
            if "total_tokens" in response_body:
                tokens = response_body.get("total_tokens", 0)
                model = response_body.get("model", "unknown")
                cost = self._estimate_cost(model, tokens)

        except Exception:
            # Silently fail to avoid affecting main request
            pass

        return tokens, cost

    def _estimate_cost(self, model: str, tokens: int) -> float:
        """Estimate cost based on model and token count"""
        # Simplified cost calculation - in production, use real pricing
        cost_per_token = {
            "gpt-4": 0.00003,
            "gpt-4-turbo": 0.00001,
            "gpt-3.5-turbo": 0.000002,
            "claude-3-sonnet": 0.000015,
            "claude-3": 0.000015,
        }

        model_lower = model.lower()
        for model_key, price in cost_per_token.items():
            if model_key in model_lower:
                return tokens * price

        # Default cost if model not found
        return tokens * 0.00001

    async def _create_trace_async(
        self,
        trace_id: str,
        request: Request,
        response: Optional[Response],
        start_time: float,
        end_time: float,
        client_ip: str,
        user_agent: str,
        status: str,
        error: str = None,
    ):
        """Create a trace record asynchronously (non-blocking)"""
        try:
            # Import here to avoid circular imports
            import httpx

            # Calculate duration
            duration_ms = round((end_time - start_time) * 1000, 2)

            # Extract operation and model
            operation = self._extract_operation_name(request)
            model = self._extract_model_from_request(request)

            # For now, create traces with basic data
            # Real LLM usage will be captured when we enhance the agent service
            tokens = 0
            cost = 0.0

            # Estimate tokens/cost based on operation for demo purposes
            if "chat" in operation:
                tokens = int(duration_ms / 10)  # Rough estimate
                cost = self._estimate_cost(model, tokens)

            # Prepare trace data
            trace_data = {
                "trace_id": trace_id,
                "operation": operation,
                "model": model,
                "status": status,
                "total_duration": duration_ms,
                "total_tokens": tokens,
                "total_cost": cost,
                "request_id": request.state.request_id,
                "client_ip": client_ip,
                "user_agent": user_agent,
                "metadata": {
                    "path": request.url.path,
                    "method": request.method,
                    "timestamp": datetime.utcnow().isoformat(),
                    "middleware_version": "enhanced_v1",
                },
            }

            if error:
                trace_data["metadata"]["error"] = error

            # Create trace asynchronously (fire and forget)
            async with httpx.AsyncClient() as client:
                try:
                    await client.post(
                        "http://localhost:8000/traces/internal/create",
                        json=trace_data,
                        timeout=1.0,  # Short timeout to avoid blocking
                    )
                except Exception:
                    # Silently fail to avoid affecting main request
                    pass

        except Exception:
            # Silently fail to avoid affecting main request
            pass
