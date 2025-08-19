from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db, get_redis, get_qdrant
from ..services.vector_service import VectorService
from ..services.llm_service import LLMService
import asyncio

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
async def basic_health():
    """Basic health check"""
    return {"status": "healthy", "message": "FastAPI backend is running"}

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
async def full_health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for all services"""
    results = {}
    
    # Check database
    try:
        db.execute(text("SELECT 1"))
        results["database"] = {"status": "healthy", "service": "postgresql"}
    except Exception as e:
        results["database"] = {"status": "unhealthy", "service": "postgresql", "error": str(e)}
    
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
    
    # Check LLM
    llm_service = LLMService()
    llm_result = await llm_service.health_check()
    results["llm"] = {"service": "llm", **llm_result}
    
    # Overall status
    all_healthy = all(
        result.get("status") == "healthy" 
        for result in results.values()
    )
    
    return {
        "overall_status": "healthy" if all_healthy else "degraded",
        "services": results
    }