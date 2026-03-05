"""Application configuration via pydantic-settings."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAG_SERVER_ROOT = Path(__file__).resolve().parents[1]
STOICS_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API Keys
    openai_api_key: str

    # Embeddings
    embedding_model: str = "text-embedding-3-small"

    # Paths
    chroma_path: Path = RAG_SERVER_ROOT / "chroma_db"
    data_path: Path = STOICS_REPO_ROOT

    # Retrieval
    retrieval_k: int = 6
    retrieval_fetch_k: int = 12
    retrieval_score_threshold: float | None = None
    max_context_chars: int = 8_000

    # Logging
    log_level: str = "INFO"

    # CORS (comma-separated string, parsed in property)
    # Use "*" to allow all origins for local network development
    cors_origins_str: str = "*"

    # Chunking parameters
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Ingestion excludes
    ingest_excluded_dirs_str: str = (
        ".git,node_modules,.next,.vercel,dist,build,"
        "chroma_db,__pycache__,.pytest_cache,.ruff_cache,venv,.venv,htmlcov"
    )

    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins_str.split(",") if origin.strip()]

    @property
    def ingest_excluded_dirs(self) -> set[str]:
        """Parse excluded directory names for ingestion."""
        return {
            item.strip()
            for item in self.ingest_excluded_dirs_str.split(",")
            if item.strip()
        }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
