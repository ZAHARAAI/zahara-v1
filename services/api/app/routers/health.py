# services/api/app/routers/health.py
from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db, get_redis
from ..services.llm_service import LLMService
from ..services.vector_service import VectorService

# Optional deps may not be available in CI; import defensively
try:
    import redis as _redis  # type: ignore
except Exception:
    _redis = None  # noqa: N816

router = APIRouter(prefix="/health", tags=["health"])


# ---------- Helpers ----------


def _db_check(db: Session) -> Dict[str, Any]:
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "service": "postgresql"}
    except SQLAlchemyError as e:
        return {"status": "unhealthy", "service": "postgresql", "error": str(e)}
    except Exception as e:  # Safety net
        return {"status": "unhealthy", "service": "postgresql", "error": str(e)}


def _redis_check() -> Dict[str, Any]:
    # Treat Redis as non-critical; if not configured or import missing -> skipped
    url = os.getenv("REDIS_URL")
    if not url or _redis is None:
        return {"status": "skipped", "service": "redis"}

    try:
        client = get_redis()
        client.ping()
        return {"status": "healthy", "service": "redis"}
    except Exception as e:
        # Non-critical: report but don't degrade overall
        return {"status": "unavailable", "service": "redis", "error": str(e)}


async def _qdrant_check() -> Dict[str, Any]:
    # Treat Qdrant as non-critical; failures shouldn't degrade overall
    try:
        vector_service = VectorService()
        result = await vector_service.health_check()
        # Ensure a 'status' key exists; default to 'unavailable' if missing
        status = result.get("status", "healthy" if result else "unavailable")
        return {
            "service": "qdrant",
            "status": status,
            **{k: v for k, v in result.items() if k != "status"},
        }
    except Exception as e:
        return {"service": "qdrant", "status": "unavailable", "error": str(e)}


async def _llm_check() -> Dict[str, Any]:
    # LLM is optional
    try:
        llm_service = LLMService()
        result = await llm_service.health_check()
        status = result.get("status", "healthy" if result else "unavailable")
        return {
            "service": "llm",
            "status": status,
            **{k: v for k, v in result.items() if k != "status"},
        }
    except Exception:
        return {
            "service": "llm",
            "status": "unavailable",
            "note": "Ollama not configured (optional)",
        }


def _compose_overall_status(services: Dict[str, Dict[str, Any]]) -> str:
    """
    Overall status is determined solely by CRITICAL components.
    Only the database is considered critical for API readiness.
    """
    db_status = services.get("database", {}).get("status")
    return "healthy" if db_status == "healthy" else "degraded"


# ---------- Endpoints ----------


# Provide BOTH paths so /health and /health/ return JSON directly (no redirect)
@router.get("", include_in_schema=False)
async def basic_health_no_slash():
    """Basic health check (no trailing slash)."""
    return {
        "status": "healthy",
        "message": "Zahara.ai API is running",
        "company": "Zahara.ai",
        "service": "api",
    }


@router.get("/")
async def basic_health():
    """Basic health check (trailing slash)."""
    return {
        "status": "healthy",
        "message": "Zahara.ai API is running",
        "company": "Zahara.ai",
        "service": "api",
    }


@router.get("/database")
async def database_health(db: Session = Depends(get_db)):
    """Check database connectivity"""
    return _db_check(db)


@router.get("/redis")
async def redis_health():
    """Check Redis connectivity (non-critical)"""
    return _redis_check()


@router.get("/qdrant")
async def qdrant_health():
    """Check Qdrant connectivity (non-critical)"""
    return await _qdrant_check()


@router.get("/llm")
async def llm_health():
    """Check LLM service connectivity (optional)"""
    return await _llm_check()


@router.get("/all")
async def all_health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for all services (alias for /full)"""
    return await full_health_check(db)


@router.get("/full")
async def full_health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for all services"""
    services: Dict[str, Dict[str, Any]] = {}

    # Critical: Database
    services["database"] = _db_check(db)

    # Non-critical: Redis
    services["redis"] = _redis_check()

    # Non-critical: Qdrant
    services["qdrant"] = await _qdrant_check()

    # Optional: LLM
    services["llm"] = await _llm_check()

    overall = _compose_overall_status(services)

    return {
        "status": overall,  # keep top-level 'status'
        "overall_status": overall,  # explicit alias if tests read this
        "company": "Zahara.ai",
        "platform": "Zahara.ai Intelligent AI Platform",
        "services": services,
    }
