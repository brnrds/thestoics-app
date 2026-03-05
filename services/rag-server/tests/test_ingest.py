"""Tests for document ingestion service."""

from unittest.mock import MagicMock, patch

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

    def test_clear_vector_store(self):
        """Test clearing vector store."""
        mock_vectorstore = MagicMock()
        mock_vectorstore._collection.get.return_value = {"ids": ["a", "b"]}

        with patch.object(IngestService, "get_existing_vectorstore", return_value=mock_vectorstore):
            service = IngestService()
            success = service.clear_vector_store()

            assert success
            mock_vectorstore._collection.delete.assert_called_once_with(ids=["a", "b"])

