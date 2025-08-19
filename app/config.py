from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import Optional
import os

class Settings(BaseSettings):
    # Application Settings
    app_name: str = "FastAPI Backend"
    app_version: str = "1.0.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Database Settings
    postgres_user: str = "fastapi_user"
    postgres_password: str = "secure_password_123"
    postgres_db: str = "fastapi_db"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    database_url: str = ""
    
    # Redis Settings
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: str = "redis_password_123"
    redis_url: str = ""
    
    # Qdrant Settings
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333
    qdrant_api_key: str = "qdrant_secure_key_123"
    qdrant_url: str = ""
    
    # LLM Settings
    local_llm_url: str = "http://ollama:11434"
    openai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    default_model: str = "tinyllama"
    
    # Authentication
    secret_key: str = "super_secret_jwt_key_change_in_production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60
    
    # Flowise Settings
    flowise_host: str = "flowise"
    flowise_port: int = 3000
    flowise_username: str = "admin"
    flowise_password: str = "flowise_admin_123"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.database_url:
            self.database_url = f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        if not self.redis_url:
            self.redis_url = f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}"
        if not self.qdrant_url:
            self.qdrant_url = f"http://{self.qdrant_host}:{self.qdrant_port}"
    
    model_config = ConfigDict(
        env_file=".env.local",
        case_sensitive=False
    )

settings = Settings()