"""Tests for RAG service."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.rag import RAGService
from app.models.schemas import Source


class TestRAGService:
    """Test cases for RAGService."""

    def test_format_context_with_documents(self, sample_documents):
        """Test formatting documents into context string."""
        with patch.object(RAGService, "_load_vectorstore"):
            service = RAGService()
            context = service.format_context(sample_documents)

            assert "propaganda.pdf" in context
            assert "crystallizing.pdf" in context
            assert "conscious and intelligent manipulation" in context
            assert "[1] Source:" in context

    def test_format_context_empty(self):
        """Test formatting empty document list."""
        with patch.object(RAGService, "_load_vectorstore"):
            service = RAGService()
            context = service.format_context([])

            assert "No relevant context found" in context

    def test_extract_sources(self, sample_documents):
        """Test extracting sources from documents."""
        with patch.object(RAGService, "_load_vectorstore"):
            service = RAGService()
            sources = service.extract_sources(sample_documents)

            assert len(sources) == 3
            assert all(isinstance(s, Source) for s in sources)
            assert sources[0].source == "propaganda.pdf"
            assert sources[0].page == 1
            assert "conscious" in sources[0].excerpt.lower()

    def test_retrieve_success(self, mock_vectorstore, sample_documents):
        """Test successful retrieval."""
        with patch.object(RAGService, "_load_vectorstore", return_value=mock_vectorstore):
            service = RAGService()
            service._vectorstore = mock_vectorstore

            docs = service.retrieve("test query")

            assert len(docs) == 3
            mock_vectorstore.similarity_search_with_score.assert_called_once()

    def test_retrieve_raises_errors(self):
        """Test retrieval surfaces errors."""
        mock_vs = MagicMock()
        mock_vs.similarity_search_with_score.side_effect = Exception("DB error")

        with patch.object(RAGService, "_load_vectorstore", return_value=mock_vs):
            service = RAGService()
            service._vectorstore = mock_vs

            with pytest.raises(Exception, match="DB error"):
                service.retrieve("test query")

    def test_retrieve_and_format(self, mock_vectorstore, sample_documents):
        """Test combined retrieve and format."""
        with patch.object(RAGService, "_load_vectorstore", return_value=mock_vectorstore):
            service = RAGService()
            service._vectorstore = mock_vectorstore

            context, sources = service.retrieve_and_format("test query")

            assert isinstance(context, str)
            assert len(sources) == 3
            assert "propaganda.pdf" in context
