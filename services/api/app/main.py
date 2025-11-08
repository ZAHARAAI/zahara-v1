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

# --- Database initialization ---
if not os.getenv("TESTING"):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Warning: Could not create database tables: {e}")

# --- FastAPI app initialization ---
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

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "https://zahara-v1-web.fly.dev",
    "https://zahara.ai",
    "https://job5-ui-sprint.vercel.app",
]
ALLOWED_ORIGIN_REGEX = r"https://job5-ui-sprint(-[a-z0-9]+)?\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # use ["*"] ONLY if allow_credentials=False
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,  # covers preview deployments
    allow_credentials=True,  # set True if you send cookies/credentials
    allow_methods=["*"],  # or list specific methods
    allow_headers=["*"],  # or ["Authorization","Content-Type","x-api-key"]
    expose_headers=["*"],  # if you need to read custom response headers
)

# --- Other middleware ---
# Keep CORS FIRST so it can handle OPTIONS requests properly
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(RateLimitMiddleware)


# --- Exception handlers ---
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


# --- Include routers ---
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

# --- Static files ---
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")


# --- Root endpoint ---
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


# --- Simple demo endpoints (optional) ---
DEMO_TOKEN = os.getenv("DEMO_TOKEN", "zahara-demo-123")


def require_api_key(request: Request):
    key = request.headers.get("X-API-Key")
    if key != DEMO_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/health")
def health_check():
    return {"ok": True}


@app.get("/whoami")
def whoami(dep: None = Depends(require_api_key)):
    return {"ok": True, "who": "frontend", "source": "zahara-ui"}


# --- Run locally ---
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
