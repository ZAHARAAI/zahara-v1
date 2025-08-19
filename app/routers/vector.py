from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..services.vector_service import VectorService
from ..middleware.auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/vector", tags=["vector"])

class CreateCollectionRequest(BaseModel):
    name: str
    vector_size: int = 384

class AddVectorsRequest(BaseModel):
    collection_name: str
    vectors: List[List[float]]
    payloads: Optional[List[Dict[str, Any]]] = None

class SearchVectorsRequest(BaseModel):
    collection_name: str
    query_vector: List[float]
    limit: int = 10
    score_threshold: float = 0.0

@router.post("/collections")
async def create_collection(
    request: CreateCollectionRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new vector collection"""
    vector_service = VectorService()
    result = await vector_service.create_collection(request.name, request.vector_size)
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result

@router.get("/collections")
async def list_collections(current_user: User = Depends(get_current_user)):
    """List all vector collections"""
    vector_service = VectorService()
    result = await vector_service.list_collections()
    
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    
    return result

@router.post("/embed")
async def add_vectors(
    request: AddVectorsRequest,
    current_user: User = Depends(get_current_user)
):
    """Add vectors to a collection"""
    vector_service = VectorService()
    result = await vector_service.add_vectors(
        request.collection_name,
        request.vectors,
        request.payloads
    )
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result

@router.post("/search")
async def search_vectors(
    request: SearchVectorsRequest,
    current_user: User = Depends(get_current_user)
):
    """Search for similar vectors"""
    vector_service = VectorService()
    result = await vector_service.search_vectors(
        request.collection_name,
        request.query_vector,
        request.limit,
        request.score_threshold
    )
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result