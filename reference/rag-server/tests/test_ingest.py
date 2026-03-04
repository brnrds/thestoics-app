"""Tests for document ingestion service."""

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from langchain_core.documents import Document

from app.services.ingest import IngestService


class TestIngestService:
    """Test cases for IngestService."""

    def test_split_documents(self, sample_documents):
        """Test document splitting."""
        service = IngestService()

        # Create a longer document to test splitting
        long_doc = Document(
            page_content=" ".join(["word"] * 500),  # ~2000 chars
            metadata={"source": "test.txt"},
        )

        chunks = service.split_documents([long_doc])

        assert len(chunks) > 1
        assert all("chunk_index" in c.metadata for c in chunks)
        assert all("ingested_at" in c.metadata for c in chunks)

    def test_split_documents_preserves_metadata(self, sample_documents):
        """Test that splitting preserves original metadata."""
        service = IngestService()

        chunks = service.split_documents(sample_documents)

        for chunk in chunks:
            assert "source" in chunk.metadata

    def test_load_all_documents_creates_directory(self, tmp_path):
        """Test that loading creates data directory if missing."""
        with patch.object(IngestService, "__init__", lambda x: None):
            service = IngestService()
            service.settings = MagicMock()
            service.settings.data_path = tmp_path / "nonexistent"

            docs = service.load_all_documents()

            assert docs == []
            assert (tmp_path / "nonexistent").exists()

    def test_get_document_stats_empty(self):
        """Test stats when no documents indexed."""
        with patch.object(IngestService, "get_existing_vectorstore", return_value=None):
            service = IngestService()
            stats = service.get_document_stats()

            assert stats == {"documents": [], "total_chunks": 0}

    def test_ingest_no_documents(self, tmp_path):
        """Test ingestion with no documents."""
        with patch.object(IngestService, "__init__", lambda x: None):
            service = IngestService()
            service.settings = MagicMock()
            service.settings.data_path = tmp_path
            service.settings.chroma_path = tmp_path / "chroma"
            service.embeddings = MagicMock()
            service.text_splitter = MagicMock()

            result = service.ingest(tmp_path)

            assert result["status"] == "warning"
            assert result["files_processed"] == 0
            assert "No documents found" in result["errors"][0]

    def test_clear_vector_store(self, tmp_path):
        """Test clearing vector store."""
        chroma_path = tmp_path / "chroma_db"
        chroma_path.mkdir()
        (chroma_path / "test.txt").touch()

        with patch.object(IngestService, "__init__", lambda x: None):
            service = IngestService()
            service.settings = MagicMock()
            service.settings.chroma_path = chroma_path

            success = service.clear_vector_store()

            assert success
            assert not chroma_path.exists()



