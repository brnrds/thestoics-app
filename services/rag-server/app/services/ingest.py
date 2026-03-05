"""Document ingestion service for processing and vectorizing documents."""

from datetime import datetime
from pathlib import Path

import structlog
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Settings, get_settings

logger = structlog.get_logger()
DEFAULT_COLLECTION_NAME = "default"


class IngestService:
    """Service for ingesting documents into the vector store."""

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.embeddings = OpenAIEmbeddings(
            model=self.settings.embedding_model,
            openai_api_key=self.settings.openai_api_key,
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def _load_pdf_documents(self, data_dir: Path) -> list[Document]:
        """Load all PDF files from directory."""
        documents: list[Document] = []
        for file_path in self._iter_files(data_dir, {".pdf"}):
            try:
                loader = PyPDFLoader(str(file_path))
                documents.extend(loader.load())
            except Exception as e:
                logger.warning("pdf_load_error", file=str(file_path), error=str(e))
        logger.info("loaded_pdfs", count=len(documents))
        return documents

    def _load_text_documents(self, data_dir: Path) -> list[Document]:
        """Load all text files from directory."""
        documents: list[Document] = []
        for file_path in self._iter_files(data_dir, {".txt"}):
            try:
                loader = TextLoader(str(file_path), autodetect_encoding=True)
                documents.extend(loader.load())
            except Exception as e:
                logger.warning("txt_load_error", file=str(file_path), error=str(e))
        logger.info("loaded_txt", count=len(documents))
        return documents

    def _load_markdown_documents(self, data_dir: Path) -> list[Document]:
        """Load all markdown files from directory."""
        documents: list[Document] = []
        for file_path in self._iter_files(data_dir, {".md"}):
            try:
                loader = TextLoader(str(file_path), autodetect_encoding=True)
                documents.extend(loader.load())
            except Exception as e:
                logger.warning("md_load_error", file=str(file_path), error=str(e))
        logger.info("loaded_md", count=len(documents))
        return documents

    def _iter_files(self, data_dir: Path, suffixes: set[str]) -> list[Path]:
        """Collect files recursively while skipping excluded directories."""
        files: list[Path] = []
        excluded_dirs = self.settings.ingest_excluded_dirs

        for path in data_dir.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in suffixes:
                continue
            try:
                relative_parts = path.relative_to(data_dir).parts[:-1]
            except ValueError:
                relative_parts = path.parts[:-1]
            if any(part in excluded_dirs for part in relative_parts):
                continue
            files.append(path)

        return files

    def load_all_documents(self, data_dir: Path | None = None) -> list[Document]:
        """Load all supported documents from the data directory."""
        data_dir = data_dir or self.settings.data_path

        if not data_dir.exists():
            logger.warning("data_dir_not_found", path=str(data_dir))
            data_dir.mkdir(parents=True, exist_ok=True)
            return []

        documents: list[Document] = []
        documents.extend(self._load_pdf_documents(data_dir))
        documents.extend(self._load_text_documents(data_dir))
        documents.extend(self._load_markdown_documents(data_dir))

        logger.info("total_documents_loaded", count=len(documents))
        return documents

    def split_documents(self, documents: list[Document]) -> list[Document]:
        """Split documents into chunks for embedding."""
        chunks = self.text_splitter.split_documents(documents)

        for i, chunk in enumerate(chunks):
            chunk.metadata["chunk_index"] = i
            chunk.metadata["ingested_at"] = datetime.now().isoformat()

        logger.info("documents_chunked", chunk_count=len(chunks))
        return chunks

    def create_vector_store(
        self,
        chunks: list[Document],
        persist_directory: Path | None = None,
    ) -> Chroma:
        """Create or update the ChromaDB vector store."""
        persist_dir = persist_directory or self.settings.chroma_path
        persist_dir.mkdir(parents=True, exist_ok=True)

        vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=str(persist_dir),
            collection_name=DEFAULT_COLLECTION_NAME,
        )

        logger.info("vectorstore_created", path=str(persist_dir), chunks=len(chunks))
        return vectorstore

    def get_existing_vectorstore(self) -> Chroma | None:
        """Load existing vector store if it exists."""
        if not self.settings.chroma_path.exists():
            return None

        try:
            return Chroma(
                persist_directory=str(self.settings.chroma_path),
                embedding_function=self.embeddings,
                collection_name=DEFAULT_COLLECTION_NAME,
            )
        except Exception as e:
            logger.warning("vectorstore_load_error", error=str(e))
            return None

    def _delete_existing_sources(self, vectorstore: Chroma, sources: set[str]) -> None:
        """Delete previously indexed chunks for the same sources to avoid duplicates."""
        collection = vectorstore._collection
        for source in sources:
            if not source:
                continue
            try:
                collection.delete(where={"source": source})
            except Exception as e:
                logger.warning("source_delete_failed", source=source, error=str(e))

    def clear_vector_store(self) -> bool:
        """Clear all documents from the default collection."""
        try:
            vectorstore = self.get_existing_vectorstore()
            if vectorstore:
                collection = vectorstore._collection
                result = collection.get()
                ids = result.get("ids", [])
                if ids:
                    collection.delete(ids=ids)
                logger.info("vectorstore_cleared", deleted=len(ids))
            return True
        except Exception as e:
            logger.error("collection_clear_error", error=str(e))
            return False

    def get_document_stats(self) -> dict:
        """Get statistics about indexed documents."""
        vectorstore = self.get_existing_vectorstore()
        if not vectorstore:
            return {"documents": [], "total_chunks": 0}

        try:
            collection = vectorstore._collection
            all_data = collection.get(include=["metadatas"])

            docs_by_source: dict[str, dict] = {}
            for metadata in all_data.get("metadatas", []):
                source = metadata.get("source", "unknown")
                if source not in docs_by_source:
                    docs_by_source[source] = {
                        "filename": Path(source).name,
                        "chunks": 0,
                        "ingested_at": metadata.get("ingested_at"),
                    }
                docs_by_source[source]["chunks"] += 1

            return {
                "documents": list(docs_by_source.values()),
                "total_chunks": len(all_data.get("metadatas", [])),
            }
        except Exception as e:
            logger.error("stats_error", error=str(e))
            return {"documents": [], "total_chunks": 0}

    def _upsert_chunks(self, chunks: list[Document]) -> None:
        """Insert chunks while replacing old chunks from the same source files."""
        vectorstore = self.get_existing_vectorstore()
        if not vectorstore:
            self.create_vector_store(chunks)
            return

        sources = {
            str(chunk.metadata.get("source", "")).strip()
            for chunk in chunks
            if chunk.metadata.get("source")
        }
        self._delete_existing_sources(vectorstore, sources)
        vectorstore.add_documents(chunks)

    def ingest(self, data_dir: Path | None = None) -> dict:
        """Run the full ingestion pipeline."""
        errors: list[str] = []

        documents = self.load_all_documents(data_dir)
        if not documents:
            return {
                "status": "warning",
                "files_processed": 0,
                "chunks_created": 0,
                "errors": ["No documents found in data directory"],
            }

        unique_files = {
            str(doc.metadata.get("source", "")).strip()
            for doc in documents
            if doc.metadata.get("source")
        }

        try:
            chunks = self.split_documents(documents)
        except Exception as e:
            errors.append(f"Chunking error: {str(e)}")
            return {
                "status": "error",
                "files_processed": 0,
                "chunks_created": 0,
                "errors": errors,
            }

        try:
            self._upsert_chunks(chunks)
        except Exception as e:
            errors.append(f"Vector store error: {str(e)}")
            return {
                "status": "error",
                "files_processed": len(unique_files),
                "chunks_created": 0,
                "errors": errors,
            }

        return {
            "status": "success",
            "files_processed": len(unique_files),
            "chunks_created": len(chunks),
            "errors": errors,
        }

    def ingest_file(
        self,
        file_path: Path,
        original_filename: str | None = None,
    ) -> dict:
        """Ingest a single file into the default vector store collection."""
        errors: list[str] = []
        display_filename = original_filename or file_path.name

        file_ext = file_path.suffix.lower()

        try:
            if file_ext == ".pdf":
                loader = PyPDFLoader(str(file_path))
            elif file_ext in {".txt", ".md"}:
                loader = TextLoader(str(file_path), autodetect_encoding=True)
            elif file_ext in {".doc", ".docx"}:
                raise ValueError(f"DOC/DOCX files not yet supported: {file_ext}")
            else:
                raise ValueError(f"Unsupported file type: {file_ext}")

            documents = loader.load()
        except Exception as e:
            errors.append(f"Load error: {str(e)}")
            return {
                "status": "error",
                "files_processed": 0,
                "chunks_created": 0,
                "errors": errors,
            }

        if not documents:
            return {
                "status": "warning",
                "files_processed": 0,
                "chunks_created": 0,
                "errors": ["No content extracted from file"],
            }

        for doc in documents:
            doc.metadata["source"] = display_filename

        try:
            chunks = self.split_documents(documents)
        except Exception as e:
            errors.append(f"Chunking error: {str(e)}")
            return {
                "status": "error",
                "files_processed": 0,
                "chunks_created": 0,
                "errors": errors,
            }

        try:
            self._upsert_chunks(chunks)
            logger.info("file_ingested", filename=display_filename, chunks=len(chunks))
        except Exception as e:
            errors.append(f"Vector store error: {str(e)}")
            return {
                "status": "error",
                "files_processed": 1,
                "chunks_created": len(chunks),
                "errors": errors,
            }

        return {
            "status": "success",
            "files_processed": 1,
            "chunks_created": len(chunks),
            "errors": errors,
        }


def get_ingest_service() -> IngestService:
    """Dependency injection for IngestService."""
    return IngestService()
