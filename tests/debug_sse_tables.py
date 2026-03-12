#!/usr/bin/env python3
"""Debug SSE test table creation."""

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_job9c_sse.db")
os.environ.setdefault("SECRET_KEY", "test_secret_key")

_mock_redis = MagicMock()
_mock_redis.get.return_value = None
_mock_redis.set.return_value = True
_mock_redis.incr.return_value = 1
_mock_qdrant = MagicMock()

with (
    patch("redis.from_url", return_value=_mock_redis),
    patch("qdrant_client.QdrantClient", return_value=_mock_qdrant),
):
    api_path = Path("services/api")
    sys.path.insert(0, str(api_path))

    from sqlalchemy import create_engine, JSON, TypeDecorator
    from sqlalchemy.dialects.postgresql import JSONB
    from app.database import Base

    TEST_DB_URL = "sqlite:///:memory:"
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})

    print(f"Base.metadata.tables count: {len(Base.metadata.tables)}")
    print(f"Tables in Base: {list(Base.metadata.tables.keys())}")

    # Shim JSONB
    class SafeJSONB(TypeDecorator):
        impl = JSONB
        cache_ok = True

        def load_dialect_impl(self, dialect):
            if dialect.name == "sqlite":
                return dialect.type_descriptor(JSON())
            return dialect.type_descriptor(JSONB())

    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = SafeJSONB()

    # Try to create
    try:
        Base.metadata.create_all(bind=engine)
        print("create_all succeeded")
    except Exception as e:
        print(f"create_all failed: {e}")
        import traceback

        traceback.print_exc()

    # Check if created
    inspector = __import__("sqlalchemy").inspect(engine)
    tables = inspector.get_table_names()
    print(f"After create_all: {len(tables)} tables created")
    print(f"Tables: {tables}")
