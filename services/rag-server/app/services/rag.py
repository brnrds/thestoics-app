"""RAG (Retrieval-Augmented Generation) service."""

from pathlib import Path

import structlog
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from app.config import Settings, get_settings
from app.models.schemas import Source

logger = structlog.get_logger()
DEFAULT_COLLECTION_NAME = "default"


class RAGService:
    """Service for retrieval-augmented generation."""

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.embeddings = OpenAIEmbeddings(
            model=self.settings.embedding_model,
            openai_api_key=self.settings.openai_api_key,
        )
        self._vectorstore: Chroma | None = None

    @property
    def vectorstore(self) -> Chroma:
        """Lazy-load the vector store."""
        if self._vectorstore is None:
            self._vectorstore = self._load_vectorstore()
        return self._vectorstore

    def _load_vectorstore(self) -> Chroma:
        """Load the default ChromaDB vector store collection."""
        chroma_path = self.settings.chroma_path

        if not chroma_path.exists():
            logger.warning("vectorstore_not_found", path=str(chroma_path))
            raise FileNotFoundError(
                f"Vector store not found at {chroma_path}. Run ingestion first."
            )

        return Chroma(
            persist_directory=str(chroma_path),
            embedding_function=self.embeddings,
            collection_name=DEFAULT_COLLECTION_NAME,
        )

    def _dedupe_retrieved_docs(
        self,
        docs_with_scores: list[tuple[Document, float]],
        k: int,
        score_threshold: float | None = None,
    ) -> list[Document]:
        """
        Deduplicate retrieval results while preserving rank order.

        Chroma returns distance scores where lower is better.
        """
        effective_threshold = (
            score_threshold
            if score_threshold is not None
            else self.settings.retrieval_score_threshold
        )

        seen: set[str] = set()
        selected: list[Document] = []

        for doc, score in docs_with_scores:
            if effective_threshold is not None and score > effective_threshold:
                continue

            source = str(doc.metadata.get("source", "unknown"))
            page = str(doc.metadata.get("page", ""))
            chunk_index = str(doc.metadata.get("chunk_index", ""))
            text_prefix = doc.page_content[:120].strip()
            dedupe_key = f"{source}|{page}|{chunk_index}|{text_prefix}"

            if dedupe_key in seen:
                continue

            seen.add(dedupe_key)
            selected.append(doc)

            if len(selected) >= k:
                break

        return selected

    def retrieve(
        self,
        query: str,
        k: int | None = None,
        score_threshold: float | None = None,
    ) -> list[Document]:
        """Retrieve relevant documents for a query."""
        k = k or self.settings.retrieval_k
        fetch_k = max(k, self.settings.retrieval_fetch_k)

        try:
            docs_with_scores = self.vectorstore.similarity_search_with_score(
                query,
                k=fetch_k,
            )
            docs = self._dedupe_retrieved_docs(docs_with_scores, k, score_threshold)

        except FileNotFoundError:
            raise
        except Exception as e:
            logger.error("retrieval_error", error=str(e))
            raise

        logger.info(
            "retrieval_complete",
            query_length=len(query),
            docs_retrieved=len(docs),
            k=k,
            fetch_k=fetch_k,
        )
        return docs

    def format_context(self, docs: list[Document]) -> str:
        """Format retrieved documents into a context string."""
        if not docs:
            return "No relevant context found in the corpus."

        formatted_parts: list[str] = []
        remaining_chars = self.settings.max_context_chars

        for i, doc in enumerate(docs, start=1):
            source = Path(doc.metadata.get("source", "unknown")).name
            page = doc.metadata.get("page", "")
            page_str = f", page {page}" if page else ""
            chunk_text = doc.page_content.strip()

            if not chunk_text:
                continue

            section = f"[{i}] Source: {source}{page_str}\n{chunk_text}"
            if len(section) > remaining_chars:
                cutoff = max(0, remaining_chars - 14)
                truncated = section[:cutoff].rstrip()
                if truncated:
                    formatted_parts.append(f"{truncated} ...[truncated]")
                break

            formatted_parts.append(section)
            remaining_chars -= len(section)
            if remaining_chars <= 0:
                break

        if not formatted_parts:
            return "No relevant context found in the corpus."

        return "\n\n".join(formatted_parts)

    def extract_sources(self, docs: list[Document]) -> list[Source]:
        """Extract source citations from documents."""
        sources = []
        for doc in docs:
            source_path = doc.metadata.get("source", "unknown")
            excerpt = " ".join(doc.page_content.strip().split())
            sources.append(
                Source(
                    source=Path(source_path).name,
                    page=doc.metadata.get("page"),
                    excerpt=excerpt[:220] + "..." if len(excerpt) > 220 else excerpt,
                )
            )
        return sources

    def retrieve_and_format(
        self,
        query: str,
        k: int | None = None,
    ) -> tuple[str, list[Source]]:
        """Retrieve documents and return formatted context + sources."""
        docs = self.retrieve(query, k=k)
        context = self.format_context(docs)
        sources = self.extract_sources(docs)
        return context, sources


def get_rag_service() -> RAGService:
    """Dependency injection for RAGService."""
    return RAGService()


