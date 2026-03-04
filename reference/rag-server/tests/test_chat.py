"""Tests for chat endpoint."""

from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.models.schemas import Source


class TestChatEndpoint:
    """Test cases for /chat endpoint."""

    def test_chat_missing_message(self, test_client):
        """Test chat with missing message."""
        response = test_client.post("/chat", json={})
        assert response.status_code == 422

    def test_chat_empty_message(self, test_client):
        """Test chat with empty message."""
        response = test_client.post("/chat", json={"message": ""})
        assert response.status_code == 422

    def test_chat_success(self, test_client):
        """Test successful chat request."""
        mock_sources = [
            Source(source="test.pdf", page=1, excerpt="Test excerpt..."),
        ]

        with patch("app.routers.chat.get_llm_service") as mock_get_llm:
            mock_service = MagicMock()
            mock_service.generate.return_value = ("Test response", mock_sources)
            mock_get_llm.return_value = mock_service

            response = test_client.post(
                "/chat",
                json={"message": "How do I persuade people?"},
            )

            assert response.status_code == 200
            data = response.json()
            assert "response" in data
            assert "sources" in data
            assert "conversation_id" in data

    def test_chat_vectorstore_missing(self, test_client):
        """Test chat when vector store is not initialized."""
        with patch("app.routers.chat.get_llm_service") as mock_get_llm:
            mock_service = MagicMock()
            mock_service.generate.side_effect = FileNotFoundError("No vectorstore")
            mock_get_llm.return_value = mock_service

            response = test_client.post(
                "/chat",
                json={"message": "Test"},
            )

            assert response.status_code == 503
            assert "vector store" in response.json()["detail"].lower()

    def test_clear_conversation(self, test_client):
        """Test clearing a conversation."""
        response = test_client.delete("/chat/conversation/test-id")
        assert response.status_code == 200


class TestHealthEndpoint:
    """Test cases for health endpoints."""

    def test_health_check(self, test_client):
        """Test health check endpoint."""
        response = test_client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_admin_health(self, test_client):
        """Test admin health endpoint."""
        response = test_client.get("/admin/health")
        assert response.status_code == 200
        assert "status" in response.json()
        assert "timestamp" in response.json()



