"""Application configuration via pydantic-settings."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API Keys
    openai_api_key: str
    anthropic_api_key: str | None = None

    # Model Configuration
    default_model: str = "gpt-4.1-mini"
    embedding_model: str = "text-embedding-3-small"

    # Paths
    chroma_path: Path = Path("./chroma_db")
    data_path: Path = Path("./data")

    # Retrieval
    retrieval_k: int = 6

    # Logging
    log_level: str = "INFO"

    # CORS (comma-separated string, parsed in property)
    # Use "*" to allow all origins for local network development
    cors_origins_str: str = "*"

    # Chunking parameters
    chunk_size: int = 1000
    chunk_overlap: int = 200

    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins_str.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

