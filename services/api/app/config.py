from typing import Optional

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application Settings
    app_name: str = "Zahara.ai API"
    app_version: str = "1.0.0"
    app_description: str = "Zahara.ai - Intelligent AI Platform API"
    company_name: str = "Zahara.ai"
    company_url: str = "https://zahara.ai"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000

    # Database Settings
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "postgres"
    postgres_host: str = "postgres"  # Default to Docker service name
    postgres_port: int = 5432
    database_url: Optional[str] = None  # Allow override via DATABASE_URL env var

    @property
    def effective_database_url(self) -> str:
        """Get the effective database URL, preferring DATABASE_URL env var if set"""
        if self.database_url:
            return self.database_url
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Redis Settings
    redis_host: str = "redis"  # Default to Docker service name
    redis_port: int = 6379
    redis_password: Optional[str] = None

    @property
    def redis_url(self) -> str:
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}"
        return f"redis://{self.redis_host}:{self.redis_port}"

    # Qdrant Settings
    qdrant_host: str = "qdrant"  # Default to Docker service name
    qdrant_port: int = 6333
    qdrant_api_key: str = ""

    @property
    def qdrant_url(self) -> str:
        return f"http://{self.qdrant_host}:{self.qdrant_port}"

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

    # Authentication
    demo_api_key: str = "zhr_demo_clinic_2024_observability_key"
    api_key_bypass_in_dev: bool = True
    dev_mode: bool = True

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
            if self.redis_password:
                self.redis_url = f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}"
            else:
                self.redis_url = f"redis://{self.redis_host}:{self.redis_port}"
        if not self.qdrant_url:
            self.qdrant_url = f"http://{self.qdrant_host}:{self.qdrant_port}"

    model_config = ConfigDict(env_file=".env.local", case_sensitive=False)


settings = Settings()
