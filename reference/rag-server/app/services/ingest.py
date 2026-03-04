"""Document ingestion service for processing and vectorizing documents."""

import hashlib
from datetime import datetime
from pathlib import Path

import structlog
from langchain_community.document_loaders import (
    DirectoryLoader,
    PyPDFLoader,
    TextLoader,
    UnstructuredMarkdownLoader,
)
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Settings, get_settings

logger = structlog.get_logger()


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

    def _get_file_hash(self, file_path: Path) -> str:
        """Generate a hash of file content for deduplication."""
        with open(file_path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()

    def _load_pdf_documents(self, data_dir: Path) -> list[Document]:
        """Load all PDF files from directory."""
        documents = []
        try:
            loader = DirectoryLoader(
                str(data_dir),
                glob="**/*.pdf",
                loader_cls=PyPDFLoader,
                show_progress=True,
                use_multithreading=True,
            )
            documents = loader.load()
            logger.info("loaded_pdfs", count=len(documents))
        except Exception as e:
            logger.warning("pdf_load_error", error=str(e))
        return documents

    def _load_text_documents(self, data_dir: Path) -> list[Document]:
        """Load all text files from directory."""
        documents = []
        try:
            loader = DirectoryLoader(
                str(data_dir),
                glob="**/*.txt",
                loader_cls=TextLoader,
                show_progress=True,
            )
            documents = loader.load()
            logger.info("loaded_txt", count=len(documents))
        except Exception as e:
            logger.warning("txt_load_error", error=str(e))
        return documents

    def _load_markdown_documents(self, data_dir: Path) -> list[Document]:
        """Load all markdown files from directory."""
        documents = []
        try:
            loader = DirectoryLoader(
                str(data_dir),
                glob="**/*.md",
                loader_cls=UnstructuredMarkdownLoader,
                show_progress=True,
            )
            documents = loader.load()
            logger.info("loaded_md", count=len(documents))
        except Exception as e:
            logger.warning("md_load_error", error=str(e))
        return documents

    def load_all_documents(self, data_dir: Path | None = None) -> list[Document]:
        """Load all supported documents from the data directory."""
        data_dir = data_dir or self.settings.data_path

        if not data_dir.exists():
            logger.warning("data_dir_not_found", path=str(data_dir))
            data_dir.mkdir(parents=True, exist_ok=True)
            return []

        documents = []
        documents.extend(self._load_pdf_documents(data_dir))
        documents.extend(self._load_text_documents(data_dir))
        documents.extend(self._load_markdown_documents(data_dir))

        logger.info("total_documents_loaded", count=len(documents))
        return documents

    def split_documents(self, documents: list[Document]) -> list[Document]:
        """Split documents into chunks for embedding."""
        chunks = self.text_splitter.split_documents(documents)

        # Add metadata
        for i, chunk in enumerate(chunks):
            chunk.metadata["chunk_index"] = i
            chunk.metadata["ingested_at"] = datetime.now().isoformat()

        logger.info("documents_chunked", chunk_count=len(chunks))
        return chunks

    def create_vector_store(
        self,
        chunks: list[Document],
        persist_directory: Path | None = None,
        collection_name: str = "default",
    ) -> Chroma:
        """Create or update the ChromaDB vector store."""
        persist_dir = persist_directory or self.settings.chroma_path
        persist_dir.mkdir(parents=True, exist_ok=True)

        vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=str(persist_dir),
            collection_name=collection_name,
        )

        logger.info("vectorstore_created", path=str(persist_dir), chunks=len(chunks), collection=collection_name)
        return vectorstore

    def get_existing_vectorstore(self, collection_name: str) -> Chroma | None:
        """Load existing vector store if it exists."""
        if not self.settings.chroma_path.exists():
            return None

        try:
            vectorstore = Chroma(
                persist_directory=str(self.settings.chroma_path),
                embedding_function=self.embeddings,
                collection_name=collection_name,
            )
            return vectorstore
        except Exception as e:
            logger.warning("vectorstore_load_error", error=str(e), collection=collection_name)
            return None

    def clear_vector_store(self, collection_name: str = "default") -> bool:
        """Clear a specific collection from the vector store.
        
        Note: ChromaDB doesn't support deleting individual collections from a persist directory
        without more complex logic. This method deletes all documents in the specified collection.
        """
        try:
            vectorstore = self.get_existing_vectorstore(collection_name=collection_name)
            if vectorstore:
                # Get all IDs in the collection and delete them
                collection = vectorstore._collection
                result = collection.get()
                if result["ids"]:
                    collection.delete(ids=result["ids"])
                logger.info("collection_cleared", collection=collection_name)
            return True
        except Exception as e:
            logger.error("collection_clear_error", error=str(e), collection=collection_name)
            return False

    def get_document_stats(self, collection_name: str = "default") -> dict:
        """Get statistics about indexed documents."""
        vectorstore = self.get_existing_vectorstore(collection_name=collection_name)
        if not vectorstore:
            return {"documents": [], "total_chunks": 0}

        try:
            collection = vectorstore._collection
            all_data = collection.get(include=["metadatas"])

            # Group by source file
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

    def ingest(self, data_dir: Path | None = None) -> dict:
        """Run the full ingestion pipeline."""
        errors = []

        # Load documents
        documents = self.load_all_documents(data_dir)
        if not documents:
            return {
                "status": "warning",
                "files_processed": 0,
                "chunks_created": 0,
                "errors": ["No documents found in data directory"],
            }

        # Count unique files
        unique_files = set()
        for doc in documents:
            source = doc.metadata.get("source", "")
            if source:
                unique_files.add(source)

        # Split into chunks
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

        # Create vector store
        try:
            self.create_vector_store(chunks)
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
        collection_name: str,
        original_filename: str | None = None,
    ) -> dict:
        """Ingest a single file into the vector store."""
        errors = []
        
        # Use original filename if provided, otherwise use file path name
        display_filename = original_filename or file_path.name
        
        # Determine file type and load
        file_ext = file_path.suffix.lower()
        documents = []
        
        try:
            if file_ext == ".pdf":
                loader = PyPDFLoader(str(file_path))
                documents = loader.load()
            elif file_ext == ".txt":
                loader = TextLoader(str(file_path))
                documents = loader.load()
            elif file_ext == ".md":
                loader = UnstructuredMarkdownLoader(str(file_path))
                documents = loader.load()
            elif file_ext in [".doc", ".docx"]:
                # For DOC/DOCX, we'd need python-docx or similar
                # For now, raise an error
                raise ValueError(f"DOC/DOCX files not yet supported: {file_ext}")
            else:
                raise ValueError(f"Unsupported file type: {file_ext}")
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
        
        # Update source metadata to use original filename
        for doc in documents:
            doc.metadata["source"] = display_filename
        
        # Split into chunks
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
        
        # Add to vector store
        try:
            # Get or create vectorstore
            vectorstore = self.get_existing_vectorstore(collection_name=collection_name)
            if vectorstore:
                # Add documents to existing collection
                vectorstore.add_documents(chunks)
            else:
                # Create new collection
                self.create_vector_store(chunks, collection_name=collection_name)
            
            logger.info(
                "file_ingested",
                filename=display_filename,
                chunks=len(chunks),
                collection=collection_name,
            )
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



