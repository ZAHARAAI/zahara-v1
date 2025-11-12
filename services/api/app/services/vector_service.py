import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional

from qdrant_client.models import Distance, PointStruct, VectorParams

try:
    from qdrant_client.exceptions import UnexpectedResponse
except ImportError:
    UnexpectedResponse = Exception  # Fallback for older qdrant_client versions

from ..database import get_qdrant
from .agent_service import AgentService

logger = logging.getLogger(__name__)


def _run_sync(func, *args, **kwargs):
    """Run a blocking function in a thread, safe to call inside async code."""
    loop = asyncio.get_running_loop()
    return loop.run_in_executor(None, lambda: func(*args, **kwargs))


class VectorService:
    def __init__(self):
        self.client = get_qdrant()  # Synchronous client
        self.agent_service = AgentService()
        # Avoid creating collections on import in production paths; keep it explicit.
        self._ensure_default_collection()

    def _ensure_default_collection(self):
        """Ensure the default collection exists (idempotent, no exception spam)."""
        try:
            vector_config = self.agent_service.get_vector_config()
            default_collection = vector_config.get(
                "default_collection", "zahara_default"
            )
            vector_size = vector_config.get("vector_size", 1536)

            try:
                # If this succeeds, we're done.
                self.client.get_collection(default_collection)
                logger.info(
                    "Default collection '%s' already exists", default_collection
                )
                return
            except Exception:
                # Try to create it; if it already exists due to race, swallow gracefully.
                try:
                    self.client.create_collection(
                        collection_name=default_collection,
                        vectors_config=VectorParams(
                            size=vector_size, distance=Distance.COSINE
                        ),
                    )
                    logger.info("Created default collection '%s'", default_collection)
                except UnexpectedResponse as ue:
                    msg = str(ue).lower()
                    if "already exists" in msg or "exists" in msg:
                        logger.info(
                            "Default collection '%s' existed after concurrent create",
                            default_collection,
                        )
                    else:
                        logger.exception("Error creating default collection: %s", ue)
                except Exception as create_error:
                    logger.exception(
                        "Error creating default collection: %s", create_error
                    )
        except Exception as e:
            logger.exception("Error ensuring default collection: %s", e)

    async def create_collection(
        self, collection_name: str, vector_size: Optional[int] = None
    ):
        """Create a new collection in Qdrant (idempotent-ish)."""
        try:
            if vector_size is None:
                cfg = self.agent_service.get_vector_config()
                vector_size = cfg.get("vector_size", 1536)

            await _run_sync(
                self.client.create_collection,
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            return {
                "status": "success",
                "message": f"Collection '{collection_name}' created",
            }
        except UnexpectedResponse as e:
            msg = str(e).lower()
            if "already exists" in msg or "exists" in msg:
                return {
                    "status": "success",
                    "message": f"Collection '{collection_name}' already exists",
                }
            return {"status": "error", "message": str(e)}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def list_collections(self):
        """List all collections"""
        try:
            collections = await _run_sync(self.client.get_collections)
            return {
                "status": "success",
                "collections": [col.name for col in collections.collections],
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def add_vectors(
        self,
        collection_name: str,
        vectors: List[List[float]],
        payloads: Optional[List[Dict[str, Any]]] = None,
    ):
        """Add vectors to a collection"""
        try:
            points = []
            for i, vector in enumerate(vectors):
                point_id = str(uuid.uuid4())
                payload = payloads[i] if payloads and i < len(payloads) else {}
                points.append(PointStruct(id=point_id, vector=vector, payload=payload))

            await _run_sync(
                self.client.upsert, collection_name=collection_name, points=points
            )
            return {"status": "success", "message": f"Added {len(vectors)} vectors"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def search_vectors(
        self,
        collection_name: str,
        query_vector: List[float],
        limit: int = 10,
        score_threshold: Optional[float] = None,
    ):
        """Search for similar vectors"""
        try:
            kwargs = dict(
                collection_name=collection_name, query_vector=query_vector, limit=limit
            )
            if score_threshold is not None:
                kwargs["score_threshold"] = score_threshold

            results = await _run_sync(self.client.search, **kwargs)

            return {
                "status": "success",
                "results": [
                    {
                        "id": r.id,
                        "score": r.score,
                        "payload": getattr(r, "payload", None),
                    }
                    for r in results
                ],
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def health_check(self):
        """Check if Qdrant is reachable; do NOT mutate state here."""
        try:
            collections = await _run_sync(self.client.get_collections)
            return {
                "status": "healthy",
                "collections_count": len(collections.collections),
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    async def sanity_check(self):
        """Perform a sanity check on the vector database (non-destructive)."""
        try:
            vector_config = self.agent_service.get_vector_config()
            default_collection = vector_config.get(
                "default_collection", "zahara_default"
            )
            vector_size = vector_config.get("vector_size", 1536)

            # Test 1: Ensure collection exists or can be created
            test_results: Dict[str, Any] = {}
            try:
                await _run_sync(self.client.get_collection, default_collection)
                test_results["collection_access"] = {
                    "status": "success",
                    "message": "Default collection accessible",
                }
            except Exception:
                test_results["collection_creation"] = await self.create_collection(
                    default_collection, vector_size
                )

            # Test 2: Insert + search a single test vector
            try:
                test_vector = [0.1] * vector_size
                test_payload = {"test": True, "message": "Sanity check vector"}

                add_result = await self.add_vectors(
                    collection_name=default_collection,
                    vectors=[test_vector],
                    payloads=[test_payload],
                )
                test_results["vector_insertion"] = add_result

                search_result = await self.search_vectors(
                    collection_name=default_collection,
                    query_vector=test_vector,
                    limit=1,
                )
                test_results["vector_search"] = search_result
            except Exception as e:
                test_results["vector_operations"] = {
                    "status": "error",
                    "message": str(e),
                }

            # Test 3: List collections
            list_result = await self.list_collections()
            test_results["collection_listing"] = list_result

            all_passed = all(
                (v.get("status") == "success") for v in test_results.values()
            )

            return {
                "status": "healthy" if all_passed else "degraded",
                "default_collection": default_collection,
                "vector_size": vector_size,
                "tests": test_results,
                "summary": "All tests passed" if all_passed else "Some tests failed",
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "message": "Vector sanity check failed",
            }
