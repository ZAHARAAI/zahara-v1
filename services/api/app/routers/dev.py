import os

from fastapi import APIRouter

router = APIRouter(prefix="/dev", tags=["development"])


@router.get("/test")
async def dev_test():
    """Development test endpoint"""
    return {
        "message": "Development mode is enabled",
        "status": "dev",
        "env": "development",
    }


@router.get("/health")
async def dev_health():
    """Development health check with extra info"""
    return {
        "status": "healthy",
        "mode": "development",
        "dev_pages_enabled": os.getenv("ENABLE_DEV_PAGES", "0") == "1",
    }
