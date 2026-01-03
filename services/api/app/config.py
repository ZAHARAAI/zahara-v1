import os
from typing import Optional

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application
    app_name: str = "Zahara.ai API"
    app_version: str = "1.0.0"
    app_description: str = "Zahara.ai - Intelligent AI Platform API"
    company_name: str = "Zahara.ai"
    company_url: str = "https://zahara.ai"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    postgres_user: str = "fastapi_user"
    postgres_password: SecretStr = SecretStr("secure_password_123")
    postgres_db: str = "fastapi_db"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    database_url: str = ""  # will be auto-built if empty

    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: Optional[SecretStr] = None
    redis_url: str = ""  # will be auto-built if empty

    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333
    qdrant_api_key: Optional[SecretStr] = None
    qdrant_url: str = ""  # will be auto-built if empty

    # LLM
    # local_llm_url: str = "http://ollama:11434"
    local_llm_url: Optional[str] = Field(
        default_factory=lambda: os.getenv("OLLAMA_HOST") or None
    )
    openai_api_key: Optional[SecretStr] = None
    openrouter_api_key: Optional[SecretStr] = None
    default_model: str = os.getenv("DEFAULT_MODEL") or "gpt-4o-mini"

    # Auth
    secret_key: SecretStr = SecretStr("super_secret_jwt_key_change_in_production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Rate limiting
    rate_limit_requests: int = 60
    rate_limit_window: int = 60

    # Flowise
    flowise_host: str = "flowise"
    flowise_port: int = 3000
    flowise_username: str = "admin"
    flowise_password: SecretStr = SecretStr("flowise_admin_123")

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    def model_post_init(self, __context) -> None:
        if not self.database_url:
            pw = self.postgres_password.get_secret_value()
            self.database_url = f"postgresql://{self.postgres_user}:{pw}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

        if not self.redis_url:
            if self.redis_password:
                rpw = self.redis_password.get_secret_value()
                self.redis_url = f"redis://:{rpw}@{self.redis_host}:{self.redis_port}"
            else:
                self.redis_url = f"redis://{self.redis_host}:{self.redis_port}"

        if not self.qdrant_url:
            self.qdrant_url = f"http://{self.qdrant_host}:{self.qdrant_port}"


settings = Settings()
