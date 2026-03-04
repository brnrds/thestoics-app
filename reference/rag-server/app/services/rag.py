"""RAG (Retrieval-Augmented Generation) service."""

from pathlib import Path

import structlog
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from app.config import Settings, get_settings
from app.models.schemas import Source

logger = structlog.get_logger()


class RAGService:
    """Service for retrieval-augmented generation."""

    def __init__(self, settings: Settings | None = None, collection_name: str = "default"):
        self.settings = settings or get_settings()
        self.embeddings = OpenAIEmbeddings(
            model=self.settings.embedding_model,
            openai_api_key=self.settings.openai_api_key,
        )
        self._vectorstore: Chroma | None = None
        self._collection_name = collection_name

    @property
    def vectorstore(self) -> Chroma:
        """Lazy-load the vector store."""
        if self._vectorstore is None:
            self._vectorstore = self._load_vectorstore()
        return self._vectorstore

    def _load_vectorstore(self, collection_name: str | None = None) -> Chroma:
        """Load the ChromaDB vector store.
        
        Args:
            collection_name: The collection to load. If not provided, uses the 
                           instance's default collection.
        """
        chroma_path = self.settings.chroma_path

        if not chroma_path.exists():
            logger.warning("vectorstore_not_found", path=str(chroma_path))
            raise FileNotFoundError(
                f"Vector store not found at {chroma_path}. Run ingestion first."
            )

        # Use provided collection or default
        coll = collection_name or getattr(self, '_collection_name', 'default')
        
        return Chroma(
            persist_directory=str(chroma_path),
            embedding_function=self.embeddings,
            collection_name=coll,
        )

    def retrieve(
        self,
        query: str,
        k: int | None = None,
        score_threshold: float | None = None,
    ) -> list[Document]:
        """Retrieve relevant documents for a query."""
        k = k or self.settings.retrieval_k

        try:
            retriever = self.vectorstore.as_retriever(
                search_type="similarity",
                search_kwargs={"k": k},
            )

            docs = retriever.invoke(query)

            # Optionally filter by score threshold
            if score_threshold is not None:
                docs_with_scores = self.vectorstore.similarity_search_with_score(
                    query, k=k
                )
                docs = [
                    doc for doc, score in docs_with_scores if score >= score_threshold
                ]

            logger.info(
                "retrieval_complete",
                query_length=len(query),
                docs_retrieved=len(docs),
            )

            return docs

        except Exception as e:
            logger.error("retrieval_error", error=str(e))
            return []

    def format_context(self, docs: list[Document]) -> str:
        """Format retrieved documents into a context string."""
        if not docs:
            return "No relevant context found in the corpus."

        formatted_parts = []
        for doc in docs:
            source = Path(doc.metadata.get("source", "unknown")).name
            page = doc.metadata.get("page", "")
            page_str = f", page {page}" if page else ""

            formatted_parts.append(
                f"[Source: {source}{page_str}]\n{doc.page_content}"
            )

        return "\n\n---\n\n".join(formatted_parts)

    def extract_sources(self, docs: list[Document]) -> list[Source]:
        """Extract source citations from documents."""
        sources = []
        for doc in docs:
            source_path = doc.metadata.get("source", "unknown")
            sources.append(
                Source(
                    source=Path(source_path).name,
                    page=doc.metadata.get("page"),
                    excerpt=doc.page_content[:200] + "..."
                    if len(doc.page_content) > 200
                    else doc.page_content,
                )
            )
        return sources

    def retrieve_and_format(self, query: str, k: int | None = None) -> tuple[str, list[Source]]:
        """Retrieve documents and return formatted context + sources."""
        docs = self.retrieve(query, k=k)
        context = self.format_context(docs)
        sources = self.extract_sources(docs)
        return context, sources


def get_rag_service() -> RAGService:
    """Dependency injection for RAGService."""
    return RAGService()



