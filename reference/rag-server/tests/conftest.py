"""Shared test fixtures."""

import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from langchain_core.documents import Document

# Set test environment
os.environ["OPENAI_API_KEY"] = "test-key"
os.environ["CHROMA_PATH"] = "./test_chroma_db"
os.environ["DATA_PATH"] = "./tests/fixtures"


@pytest.fixture
def sample_documents():
    """Sample documents for testing."""
    return [
        Document(
            page_content=(
                "The conscious and intelligent manipulation of the organized "
                "habits and opinions of the masses is an important element in "
                "democratic society."
            ),
            metadata={"source": "propaganda.pdf", "page": 1},
        ),
        Document(
            page_content=(
                "We are governed, our minds are molded, our tastes formed, "
                "our ideas suggested, largely by men we have never heard of."
            ),
            metadata={"source": "propaganda.pdf", "page": 2},
        ),
        Document(
            page_content=(
                "The public relations counsel is the agent working with "
                "modern media of communications and the group formations "
                "of society to provide ideas to the public's consciousness."
            ),
            metadata={"source": "crystallizing.pdf", "page": 15},
        ),
    ]


@pytest.fixture
def mock_vectorstore(sample_documents):
    """Mock ChromaDB vector store."""
    mock = MagicMock()
    mock.as_retriever.return_value.invoke.return_value = sample_documents
    mock.similarity_search_with_score.return_value = [
        (doc, 0.9) for doc in sample_documents
    ]
    return mock


@pytest.fixture
def mock_embeddings():
    """Mock OpenAI embeddings."""
    mock = MagicMock()
    mock.embed_query.return_value = [0.1] * 1536
    mock.embed_documents.return_value = [[0.1] * 1536]
    return mock


@pytest.fixture
def test_client():
    """FastAPI test client."""
    from app.main import app

    return TestClient(app)


@pytest.fixture
def fixtures_dir():
    """Path to test fixtures directory."""
    path = Path(__file__).parent / "fixtures"
    path.mkdir(exist_ok=True)
    return path



