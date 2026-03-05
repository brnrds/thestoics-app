"""Pydantic request/response models for the RAG API."""

from datetime import datetime
from pydantic import BaseModel, Field


class Source(BaseModel):
    """A source citation from the indexed corpus."""

    source: str
    page: int | None = None
    excerpt: str


class RetrieveRequest(BaseModel):
    """Request body for retrieval."""

    query: str = Field(..., min_length=1, description="User query to retrieve against")
    k: int | None = Field(default=None, ge=1, le=20, description="Top-K retrieval override")
    score_threshold: float | None = Field(
        default=None,
        description="Optional max distance score threshold (lower is better)",
    )


class RetrieveResponse(BaseModel):
    """Response body for retrieval."""

    query: str
    context: str
    sources: list[Source]
    match_count: int


class IngestRequest(BaseModel):
    """Request body for ingestion from a local directory."""

    directory: str | None = Field(default=None, description="Path to documents")


class IngestResponse(BaseModel):
    """Response body for ingestion operations."""

    status: str
    files_processed: int
    chunks_created: int
    errors: list[str]


class IngestStatsDocument(BaseModel):
    """Per-document index stats."""

    filename: str
    chunks: int
    ingested_at: datetime | None = None


class IngestStatsResponse(BaseModel):
    """Response body for indexed document stats."""

    documents: list[IngestStatsDocument]
    total_chunks: int


class ClearRequest(BaseModel):
    """Safety guard for destructive clear operations."""

    confirm: bool = Field(default=False)


class ClearResponse(BaseModel):
    """Response body for index clear operation."""

    status: str
    message: str
