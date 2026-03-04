"""Pydantic request/response models."""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# --- Source Models ---
class Source(BaseModel):
    """A source citation from the corpus."""

    source: str
    page: int | None = None
    excerpt: str


# --- Chat Models ---
class HistoryMessage(BaseModel):
    """A message in conversation history (for context)."""

    role: str  # "user" or "assistant"
    content: str


class RAGConfig(BaseModel):
    """Configuration for RAG and LLM generation."""

    use_rag: bool = True
    temperature: float | None = None
    k: int | None = None
    model: str | None = None
    system_prompt_override: str | None = None


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""

    message: str = Field(..., min_length=1, description="User's question or situation")
    conversation_id: UUID | None = Field(default=None, description="UUID for conversation continuity")
    model: str | None = Field(default=None, description="LLM model to use")
    history: list[HistoryMessage] | None = Field(default=None, description="Previous messages for context")
    use_rag: bool = Field(default=True, description="Whether to use RAG for this request")
    config_a: RAGConfig | None = Field(default=None, description="Configuration for the first response (compare mode)")
    config_b: RAGConfig | None = Field(default=None, description="Configuration for the second response (compare mode)")


class ChatResponse(BaseModel):
    """Response body for chat endpoint (non-streaming)."""

    response: str
    sources: list[Source]
    conversation_id: UUID = Field(default_factory=uuid4)


class StreamEvent(BaseModel):
    """A single event in the streaming response."""

    type: str  # "token", "sources", "done", "error"
    content: str | list[Source] | None = None


# --- Ingest Models ---
class IngestRequest(BaseModel):
    """Request body for ingest endpoint."""

    directory: str | None = Field(default=None, description="Path to documents")


class IngestResponse(BaseModel):
    """Response body for ingest endpoint."""

    status: str
    files_processed: int
    chunks_created: int
    errors: list[str]


# --- Admin Models ---
class DocumentInfo(BaseModel):
    """Information about an indexed document."""

    filename: str
    chunks: int
    ingested_at: datetime | None = None


class DocumentsResponse(BaseModel):
    """Response body for admin/documents endpoint."""

    documents: list[DocumentInfo]
    total_chunks: int


class ClearResponse(BaseModel):
    """Response body for admin/clear endpoint."""

    status: str
    message: str


# --- Message Models (for conversation history) ---
class Message(BaseModel):
    """A single message in a conversation."""

    id: UUID = Field(default_factory=uuid4)
    role: str  # "user" or "assistant"
    content: str
    sources: list[Source] | None = None
    timestamp: datetime = Field(default_factory=datetime.now)


class Conversation(BaseModel):
    """A conversation with message history."""

    id: UUID = Field(default_factory=uuid4)
    messages: list[Message] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)


# --- Dataset Models ---
class SyntheticDataPair(BaseModel):
    """A generated training example for fine-tuning."""

    id: UUID = Field(default_factory=uuid4)
    user_question: str = Field(
        ...,
        alias="userQuestion",
        description="A realistic question a modern client might ask",
    )
    assistant_response: str = Field(
        ...,
        alias="assistantResponse",
        description="The assistant's response in the configured persona style",
    )
    source_chunk: str = Field(
        ...,
        alias="sourceChunk",
        description="The original text used to generate this pair",
    )
    status: str = Field(default="draft", description="draft, approved, rejected")
    created_at: datetime = Field(default_factory=datetime.now)

    model_config = {"populate_by_name": True}


# --- Collection Management Models ---
class ClearCollectionRequest(BaseModel):
    """Request body for clearing a collection."""

    collection: str = Field(..., description="Collection name (required)")
    confirm: bool = Field(..., description="Must be true to confirm deletion")


# --- Generation Models ---
class GenerateRequest(BaseModel):
    """Request body for generating synthetic training data."""

    collection: str = Field(..., description="Collection name (required)")
    count: int = Field(ge=1, le=100, default=10, description="Number of examples to generate")
    model: str = Field(default="gpt-4.1", description="LLM model to use for generation")
    temperature: float = Field(default=0.7, ge=0, le=2, description="Temperature for generation")
    topicMode: str = Field(
        default="classic_random",
        description="Topic mode: classic_random, classic, tone, or foundation"
    )
    systemPromptOverride: str | None = Field(default=None, description="Override system prompt")
    sourceContent: list[str] | None = Field(
        default=None,
        description="Direct source content for tone/foundation modes (passed from frontend)"
    )


class GenerateTaskStatus(BaseModel):
    """Status of a generation task."""

    taskId: str
    status: str = Field(description="pending, running, completed, or failed")
    progress: dict = Field(default_factory=lambda: {"completed": 0, "total": 0})
    results: list | None = None
    error: str | None = None


# --- Export Models ---
class ExportExample(BaseModel):
    """A single example for export."""

    user_question: str
    assistant_response: str


class ExportRequest(BaseModel):
    """Request body for exporting training data."""

    examples: list[ExportExample]
    system_prompt: str | None = None


# --- Fine-tune Models ---
class UploadRequest(BaseModel):
    """Request body for uploading training data to OpenAI."""

    examples: list[dict] = Field(..., description="Training examples in OpenAI chat format")


class SubmitRequest(BaseModel):
    """Request body for submitting a fine-tuning job."""

    file_id: str = Field(..., description="OpenAI file ID from upload")
    base_model: str = Field(default="gpt-4o-mini-2024-07-18", description="Base model for fine-tuning")
    hyperparameters: dict | None = Field(default=None, description="Training hyperparameters")
