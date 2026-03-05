"""Tests for retrieval endpoints."""

from unittest.mock import MagicMock

from app.models.schemas import Source
from app.services.rag import get_rag_service


class TestRetrieveEndpoint:
    """Test cases for /rag/retrieve endpoint."""

    def test_retrieve_missing_query(self, test_client):
        """Test retrieval with missing query."""
        response = test_client.post("/rag/retrieve", json={})
        assert response.status_code == 422

    def test_retrieve_empty_query(self, test_client):
        """Test retrieval with empty query."""
        response = test_client.post("/rag/retrieve", json={"query": ""})
        assert response.status_code == 422

    def test_retrieve_success(self, test_client):
        """Test successful retrieval request."""
        mock_sources = [
            Source(source="test.pdf", page=1, excerpt="Test excerpt..."),
        ]

        mock_doc = MagicMock()
        mock_service = MagicMock()
        mock_service.retrieve.return_value = [mock_doc]
        mock_service.extract_sources.return_value = mock_sources
        mock_service.format_context.return_value = "[1] Source: test.pdf\nTest excerpt..."
        test_client.app.dependency_overrides[get_rag_service] = lambda: mock_service
        try:
            response = test_client.post(
                "/rag/retrieve",
                json={"query": "How do I persuade people?"},
            )
        finally:
            test_client.app.dependency_overrides.pop(get_rag_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "How do I persuade people?"
        assert "context" in data
        assert "sources" in data
        assert data["match_count"] == 1

    def test_retrieve_vectorstore_missing(self, test_client):
        """Test retrieval when vector store is not initialized."""
        mock_service = MagicMock()
        mock_service.retrieve.side_effect = FileNotFoundError("No vectorstore")
        test_client.app.dependency_overrides[get_rag_service] = lambda: mock_service
        try:
            response = test_client.post(
                "/rag/retrieve",
                json={"query": "Test"},
            )
        finally:
            test_client.app.dependency_overrides.pop(get_rag_service, None)

        assert response.status_code == 503
        assert "vector store" in response.json()["detail"].lower()


class TestHealthEndpoint:
    """Test cases for health endpoint."""

    def test_health_check(self, test_client):
        """Test health check endpoint."""
        response = test_client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
