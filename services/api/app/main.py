# --- Standard library
import os

# --- Third-party libraries
import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# --- Local imports
from . import compat  # ensure patch applied before router import  # noqa: F401
from .config import settings
from .database import Base, engine
from .middleware.observability import ObservabilityMiddleware
from .middleware.rate_limit import RateLimitMiddleware
from .routers import (
    agents,
    api_keys,
    auth,
    dev,
    flows,
    health,
    llm_router,
    vector,
    version,
)

# Create database tables (skip during testing)
if not os.getenv("TESTING"):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        # Log error but don't fail startup
        print(f"Warning: Could not create database tables: {e}")

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=settings.app_description,
    debug=settings.debug,
    contact={
        "name": settings.company_name,
        "url": settings.company_url,
    },
    license_info={
        "name": "MIT License",
        "url": "https://github.com/zahara-ai/zahara-v1/blob/main/LICENSE",
    },
)

# CORS middleware
allowed_origins = (
    ["*"]
    if settings.debug
    else ["http://localhost:3000", "http://localhost:8000", "https://zahara.ai"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Observability middleware (should be first to capture all requests)
app.add_middleware(ObservabilityMiddleware)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware)


# Exception handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not found",
            "detail": "The requested resource was not found",
        },
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": "An unexpected error occurred",
        },
    )


# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(vector.router)
app.include_router(llm_router.router)
app.include_router(llm_router.v1_router)
app.include_router(agents.router)
app.include_router(version.router)
app.include_router(api_keys.router)
app.include_router(flows.router)

# Include dev router only if dev pages are enabled
if os.getenv("ENABLE_DEV_PAGES") == "1":
    app.include_router(dev.router)

# Mount static files
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")


# Root endpoint
@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.app_name}",
        "company": settings.company_name,
        "version": settings.app_version,
        "docs": "/docs",
        "dashboard": "/static/index.html",
        "website": settings.company_url,
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app", host=settings.host, port=settings.port, reload=settings.debug
    )
# --- Zahara: CORS + Demo API Key + Health --------------------


ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://zahara-v1-web.fly.dev",
    "https://zahara.ai",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_TOKEN = os.getenv("DEMO_TOKEN", "zahara-demo-123")


def require_api_key(request: Request):
    key = request.headers.get("X-API-Key")
    if key != DEMO_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/whoami")
def whoami(dep: None = Depends(require_api_key)):
    return {"ok": True, "who": "frontend", "source": "zahara-ui"}


# --------------------------------------------------------------
