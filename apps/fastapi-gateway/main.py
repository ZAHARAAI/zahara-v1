"""
FastAPI Gateway Service
Handles API requests with retries, circuit breaker, and observability
"""

import os
import time
import uuid
import logging
import asyncio
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import json

# OpenTelemetry imports
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure OpenTelemetry
def setup_tracing():
    """Initialize OpenTelemetry tracing with Jaeger exporter"""
    trace.set_tracer_provider(TracerProvider())
    tracer = trace.get_tracer(__name__)
    
    jaeger_exporter = JaegerExporter(
        agent_host_name=os.getenv("JAEGER_AGENT_HOST", "localhost"),
        agent_port=int(os.getenv("JAEGER_AGENT_PORT", "14268")),
    )
    
    span_processor = BatchSpanProcessor(jaeger_exporter)
    trace.get_tracer_provider().add_span_processor(span_processor)
    
    return tracer

# Initialize tracing
tracer = setup_tracing()

# Circuit breaker state
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
    
    def can_execute(self) -> bool:
        if self.state == "CLOSED":
            return True
        elif self.state == "OPEN":
            if time.time() - self.last_failure_time > self.timeout:
                self.state = "HALF_OPEN"
                return True
            return False
        else:  # HALF_OPEN
            return True
    
    def on_success(self):
        self.failure_count = 0
        self.state = "CLOSED"
    
    def on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"

# Global circuit breaker instance
circuit_breaker = CircuitBreaker()

# Pydantic models
class ExecuteRequest(BaseModel):
    task: str
    parameters: Optional[Dict[str, Any]] = {}

class ExecuteResponse(BaseModel):
    request_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: int
    attempt: int

# FastAPI app with lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting FastAPI Gateway...")
    HTTPXClientInstrumentor().instrument()
    FastAPIInstrumentor.instrument_app(app)
    yield
    # Shutdown
    logger.info("Shutting down FastAPI Gateway...")

app = FastAPI(
    title="Zahara FastAPI Gateway",
    description="Gateway service with retries, circuit breaker, and observability",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Key validation
def get_api_key(x_api_key: str = Header(None)) -> str:
    """Validate API key from header"""
    expected_key = os.getenv("API_KEY", "default-api-key")
    if not x_api_key or x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key

# Retry configuration with exponential backoff and jitter
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException))
)
async def execute_with_retry(
    request_id: str,
    task: str,
    parameters: Dict[str, Any],
    attempt: int = 1
) -> Dict[str, Any]:
    """Execute task with retry logic and circuit breaker"""
    
    if not circuit_breaker.can_execute():
        raise HTTPException(status_code=503, detail="Circuit breaker is OPEN")
    
    try:
        # Simulate task execution (replace with actual agent runtime call)
        with tracer.start_as_current_span("execute_task") as span:
            span.set_attribute("request_id", request_id)
            span.set_attribute("task", task)
            span.set_attribute("attempt", attempt)
            
            # Simulate processing time
            await asyncio.sleep(0.1)
            
            # Simulate success/failure based on task content
            if "error" in task.lower():
                raise HTTPException(status_code=500, detail="Simulated error")
            
            result = {
                "task": task,
                "parameters": parameters,
                "processed_at": time.time(),
                "request_id": request_id
            }
            
            circuit_breaker.on_success()
            return result
            
    except Exception as e:
        circuit_breaker.on_failure()
        logger.error(f"Task execution failed: {str(e)}")
        raise

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "fastapi-gateway"}

@app.post("/execute", response_model=ExecuteResponse)
async def execute_task(
    request: ExecuteRequest,
    request_obj: Request,
    api_key: str = Depends(get_api_key)
):
    """
    Execute a task with retries, circuit breaker, and observability
    """
    start_time = time.time()
    request_id = request_obj.headers.get("X-Request-Id", str(uuid.uuid4()))
    
    # Create structured log entry
    log_entry = {
        "request_id": request_id,
        "task": request.task,
        "timestamp": time.time(),
        "service": "fastapi-gateway"
    }
    
    try:
        with tracer.start_as_current_span("execute_endpoint") as span:
            span.set_attribute("request_id", request_id)
            span.set_attribute("task", request.task)
            span.set_attribute("api_key_valid", True)
            
            # Execute with retry logic
            result = await execute_with_retry(
                request_id=request_id,
                task=request.task,
                parameters=request.parameters,
                attempt=1
            )
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Log successful execution
            log_entry.update({
                "status": "success",
                "latency_ms": latency_ms,
                "attempt": 1
            })
            logger.info(json.dumps(log_entry))
            
            return ExecuteResponse(
                request_id=request_id,
                status="success",
                result=result,
                latency_ms=latency_ms,
                attempt=1
            )
            
    except HTTPException as e:
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Log error
        log_entry.update({
            "status": "error",
            "error": e.detail,
            "status_code": e.status_code,
            "latency_ms": latency_ms,
            "attempt": 1
        })
        logger.error(json.dumps(log_entry))
        
        raise e
        
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Log unexpected error
        log_entry.update({
            "status": "error",
            "error": str(e),
            "latency_ms": latency_ms,
            "attempt": 1
        })
        logger.error(json.dumps(log_entry))
        
        raise HTTPException(status_code=500, detail="Internal server error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
