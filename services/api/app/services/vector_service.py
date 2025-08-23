import uuid
from typing import Any, Dict, List, Optional

from qdrant_client.models import Distance, PointStruct, VectorParams

try:
    from qdrant_client.exceptions import UnexpectedResponse
except ImportError:
    # Fallback for older qdrant_client versions
    UnexpectedResponse = Exception

from ..database import get_qdrant
from .agent_service import AgentService


class VectorService:
    def __init__(self):
        self.client = get_qdrant()
        self.agent_service = AgentService()
        self._ensure_default_collection()

    def _ensure_default_collection(self):
        """Ensure the default collection exists"""
        try:
            vector_config = self.agent_service.get_vector_config()
            default_collection = vector_config.get("default_collection", "zahara_default")
            vector_size = vector_config.get("vector_size", 1536)

            # Check if collection exists first
            try:
                self.client.get_collection(default_collection)
                print(f"Default collection '{default_collection}' already exists")
                return  # Collection exists, nothing to do
            except Exception:
                # Collection doesn't exist, try to create it
                try:
                    self.client.create_collection(
                        collection_name=default_collection,
                        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
                    )
                    print(f"Created default collection: {default_collection}")
                except Exception as create_error:
                    # If creation fails because it already exists, that's OK
                    if "already exists" in str(create_error).lower():
                        print(f"Default collection '{default_collection}' already exists (concurrent creation)")
                    else:
                        print(f"Error creating default collection: {create_error}")
        except Exception as e:
            print(f"Error ensuring default collection: {e}")

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

    async def sanity_check(self):
        """Perform a sanity check on the vector database"""
        try:
            # Get vector configuration
            vector_config = self.agent_service.get_vector_config()
            default_collection = vector_config.get("default_collection", "zahara_default")
            vector_size = vector_config.get("vector_size", 1536)

            # Check if default collection exists
            try:
                self.client.get_collection(default_collection)
                collection_exists = True
            except Exception:
                collection_exists = False

            # Test basic operations
            test_results = {}

            # Test 1: Collection creation/access
            if not collection_exists:
                create_result = await self.create_collection(default_collection, vector_size)
                test_results["collection_creation"] = create_result
            else:
                test_results["collection_access"] = {"status": "success", "message": "Default collection accessible"}

            # Test 2: Vector insertion and search
            try:
                # Insert a test vector
                test_vector = [0.1] * vector_size
                test_payload = {"test": True, "message": "Sanity check vector"}

                add_result = await self.add_vectors(
                    collection_name=default_collection,
                    vectors=[test_vector],
                    payloads=[test_payload]
                )
                test_results["vector_insertion"] = add_result

                # Test vector search
                search_result = await self.search_vectors(
                    collection_name=default_collection,
                    query_vector=test_vector,
                    limit=1
                )
                test_results["vector_search"] = search_result

            except Exception as e:
                test_results["vector_operations"] = {"status": "error", "message": str(e)}

            # Test 3: Collection listing
            list_result = await self.list_collections()
            test_results["collection_listing"] = list_result

            # Overall health assessment
            all_passed = all(
                result.get("status") == "success"
                for result in test_results.values()
            )

            return {
                "status": "healthy" if all_passed else "degraded",
                "default_collection": default_collection,
                "vector_size": vector_size,
                "tests": test_results,
                "summary": "All tests passed" if all_passed else "Some tests failed"
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "message": "Vector sanity check failed"
            }
