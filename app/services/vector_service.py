from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from typing import List, Dict, Any, Optional
import uuid
from ..database import get_qdrant
from ..config import settings

class VectorService:
    def __init__(self):
        self.client = get_qdrant()
    
    async def create_collection(self, collection_name: str, vector_size: int = 384):
        """Create a new collection in Qdrant"""
        try:
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
            )
            return {"status": "success", "message": f"Collection '{collection_name}' created"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def list_collections(self):
        """List all collections"""
        try:
            collections = self.client.get_collections()
            return {
                "status": "success", 
                "collections": [col.name for col in collections.collections]
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def add_vectors(self, collection_name: str, vectors: List[List[float]], 
                         payloads: Optional[List[Dict[str, Any]]] = None):
        """Add vectors to a collection"""
        try:
            points = []
            for i, vector in enumerate(vectors):
                point_id = str(uuid.uuid4())
                payload = payloads[i] if payloads and i < len(payloads) else {}
                points.append(PointStruct(id=point_id, vector=vector, payload=payload))
            
            self.client.upsert(collection_name=collection_name, points=points)
            return {"status": "success", "message": f"Added {len(vectors)} vectors"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def search_vectors(self, collection_name: str, query_vector: List[float], 
                           limit: int = 10, score_threshold: float = 0.0):
        """Search for similar vectors"""
        try:
            results = self.client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                limit=limit,
                score_threshold=score_threshold
            )
            
            return {
                "status": "success",
                "results": [
                    {
                        "id": result.id,
                        "score": result.score,
                        "payload": result.payload
                    }
                    for result in results
                ]
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def health_check(self):
        """Check if Qdrant is healthy"""
        try:
            collections = self.client.get_collections()
            return {"status": "healthy", "collections_count": len(collections.collections)}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}