# --- Standard library
import os

# --- Third-party libraries
import uvicorn
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

# --- Local imports
from . import compat  # ensure patch applied before router import  # noqa: F401
from .config import settings
from .middleware.auth import get_current_user
from .middleware.observability import ObservabilityMiddleware
from .middleware.rate_limit import RateLimitMiddleware
from .models.user import User
from .routers import (
    agents,
    api_keys,
    auth,
    clinic,
    dev,
    files,
    flows,
    health,
    llm_router,
    mcp,
    provider_keys,
    run,
    usage,
    vector,
    version,
)

# Create database tables (skip during testing)
# if not os.getenv("TESTING"):
#     try:
#         Base.metadata.create_all(bind=engine)
#     except Exception as e:
#         # Log error but don't fail startup
#         print(f"Warning: Could not create database tables: {e}")

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

# Enable gzip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=1024)

# CORS middleware
allowed_origins = (
    ["*"]
    if settings.debug
    else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "https://zahara-v1-web.fly.dev",
        "https://zahara.ai",
        "https://job5-ui-sprint.vercel.app",
    ]
)

ALLOWED_ORIGIN_REGEX = r"https://job5-ui-sprint(-[a-z0-9]+)?\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # use ["*"] ONLY if allow_credentials=False
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,  # covers preview deployments
    allow_credentials=False
    if settings.debug
    else True,  # set True if you send cookies/credentials
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],  # or ["Authorization","Content-Type","x-api-key"]
    expose_headers=["*"],  # if you need to read custom response headers
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
app.include_router(agents.router)
app.include_router(api_keys.router)
app.include_router(auth.router)
app.include_router(clinic.router)
# app.include_router(dev.router)
app.include_router(files.router)
app.include_router(flows.router)
app.include_router(health.router)
app.include_router(llm_router.router)
app.include_router(llm_router.v1_router)
app.include_router(mcp.router)
app.include_router(provider_keys.router)
app.include_router(run.router)
app.include_router(usage.router)
app.include_router(vector.router)
app.include_router(version.router)

# Also expose all endpoints under /api/* for Job6 spec compatibility
api_v1 = APIRouter(prefix="/api")
api_v1.include_router(agents.router)
api_v1.include_router(api_keys.router)
api_v1.include_router(auth.router)
api_v1.include_router(clinic.router)
api_v1.include_router(files.router)
api_v1.include_router(flows.router)
api_v1.include_router(health.router)
api_v1.include_router(llm_router.router)
api_v1.include_router(llm_router.v1_router)
api_v1.include_router(mcp.router)
api_v1.include_router(provider_keys.router)
api_v1.include_router(run.router)
api_v1.include_router(usage.router)
api_v1.include_router(vector.router)
api_v1.include_router(version.router)
app.include_router(api_v1)

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
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/whoami")
def whoami(
    current_user: User = Depends(get_current_user),
):
    return {"ok": True, "who": "frontend", "source": "zahara-ui"}
