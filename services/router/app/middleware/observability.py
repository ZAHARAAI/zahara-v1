"""
Observability middleware for the Router service
Provides JSON logs with request_id and per-request latency
"""

import json
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Configure JSON logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',  # We'll format as JSON ourselves
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger("zahara.router.observability")

class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Middleware for observability: request tracking, JSON logging, metrics"""
    
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
        
        # Log request start
        self._log_request_start(
            request_id=request_id,
            method=request.method,
            url=str(request.url),
            client_ip=client_ip,
            user_agent=user_agent
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate latency
            end_time = time.time()
            latency_ms = round((end_time - start_time) * 1000, 2)
            
            # Add observability headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{latency_ms}ms"
            
            # Log successful request
            self._log_request_success(
                request_id=request_id,
                method=request.method,
                url=str(request.url),
                status_code=response.status_code,
                latency_ms=latency_ms,
                client_ip=client_ip
            )
            
            return response
            
        except Exception as e:
            # Calculate latency for failed requests too
            end_time = time.time()
            latency_ms = round((end_time - start_time) * 1000, 2)
            
            # Log request error
            self._log_request_error(
                request_id=request_id,
                method=request.method,
                url=str(request.url),
                error=str(e),
                latency_ms=latency_ms,
                client_ip=client_ip
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
    
    def _log_request_start(self, request_id: str, method: str, url: str, 
                          client_ip: str, user_agent: str):
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
            "service": "zahara-router"
        }
        
        logger.info(json.dumps(log_data))
    
    def _log_request_success(self, request_id: str, method: str, url: str,
                           status_code: int, latency_ms: float, client_ip: str):
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
            "service": "zahara-router"
        }
        
        logger.info(json.dumps(log_data))
    
    def _log_request_error(self, request_id: str, method: str, url: str,
                          error: str, latency_ms: float, client_ip: str):
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
            "service": "zahara-router"
        }
        
        logger.error(json.dumps(log_data))
