from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db, get_redis
from ..services.llm_service import LLMService
from ..services.vector_service import VectorService

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/")
async def basic_health():
    """Basic health check"""
    return {
        "status": "healthy",
        "message": "Zahara.ai API is running",
        "company": "Zahara.ai",
        "service": "api",
    }


@router.get("/database")
async def database_health(db: Session = Depends(get_db)):
    """Check database connectivity"""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "service": "postgresql"}
    except Exception as e:
        return {"status": "unhealthy", "service": "postgresql", "error": str(e)}


@router.get("/redis")
async def redis_health():
    """Check Redis connectivity"""
    try:
        redis_client = get_redis()
        redis_client.ping()
        return {"status": "healthy", "service": "redis"}
    except Exception as e:
        return {"status": "unhealthy", "service": "redis", "error": str(e)}


@router.get("/qdrant")
async def qdrant_health():
    """Check Qdrant connectivity"""
    vector_service = VectorService()
    result = await vector_service.health_check()
    return {"service": "qdrant", **result}


@router.get("/llm")
async def llm_health():
    """Check LLM service connectivity"""
    llm_service = LLMService()
    result = await llm_service.health_check()
    return {"service": "llm", **result}


@router.get("/all")
async def all_health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for all services (alias for /full)"""
    return await full_health_check(db)


@router.get("/full")
async def full_health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for all services"""
    results = {}

    # Check database
    try:
        db.execute(text("SELECT 1"))
        results["database"] = {"status": "healthy", "service": "postgresql"}
    except Exception as e:
        results["database"] = {
            "status": "unhealthy",
            "service": "postgresql",
            "error": str(e),
        }

    # Check Redis
    try:
        redis_client = get_redis()
        redis_client.ping()
        results["redis"] = {"status": "healthy", "service": "redis"}
    except Exception as e:
        results["redis"] = {"status": "unhealthy", "service": "redis", "error": str(e)}

    # Check Qdrant
    vector_service = VectorService()
    qdrant_result = await vector_service.health_check()
    results["qdrant"] = {"service": "qdrant", **qdrant_result}

    # Check LLM (optional - Ollama not required for core functionality)
    try:
        llm_service = LLMService()
        llm_result = await llm_service.health_check()
        results["llm"] = {"service": "llm", **llm_result}
    except Exception:
        results["llm"] = {
            "service": "llm",
            "status": "unavailable",
            "note": "Ollama not configured (optional)",
        }

    # Overall status (LLM is optional, so exclude from health calculation)
    core_services = ["database", "redis", "qdrant"]
    all_healthy = all(
        results[service].get("status") == "healthy"
        for service in core_services
        if service in results
    )

    return {
        "status": "healthy" if all_healthy else "degraded",
        "overall_status": "healthy" if all_healthy else "degraded",
        "company": "Zahara.ai",
        "platform": "Zahara.ai Intelligent AI Platform",
        "services": results,
    }
