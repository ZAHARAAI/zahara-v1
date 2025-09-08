import os
import redis
from qdrant_client import QdrantClient
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

# PostgreSQL Database
engine = create_engine(settings.effective_database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Redis Connection
def get_redis():
    # Skip Redis connection in test mode
    if os.getenv("TESTING") == "true" or os.getenv("SKIP_REDIS_CONNECTION") == "true":
        # Return a mock Redis client for testing
        class MockRedis:
            def ping(self):
                return True
            def get(self, key):
                return None
            def set(self, key, value, ex=None):
                return True
            def delete(self, key):
                return True
            def pipeline(self):
                return MockRedisPipeline()
            def incr(self, key):
                return 1
            def expire(self, key, seconds):
                return True
            def ttl(self, key):
                return -1
        
        class MockRedisPipeline:
            def incr(self, key):
                return self
            def expire(self, key, seconds):
                return self
            def execute(self):
                return [1, True]
        return MockRedis()
    
    return redis.from_url(settings.redis_url, decode_responses=True)

# Qdrant Connection
def get_qdrant():
    # Skip Qdrant connection in test mode
    if os.getenv("TESTING") == "true" or os.getenv("SKIP_QDRANT_CONNECTION") == "true":
        # Return a mock Qdrant client for testing
        class MockQdrant:
            def get_collections(self):
                return []
            def collection_exists(self, collection_name):
                return False
        return MockQdrant()
    
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key
    )
