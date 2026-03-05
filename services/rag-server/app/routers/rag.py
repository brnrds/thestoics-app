"""Retrieval endpoints for the RAG backend."""

import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import RetrieveRequest, RetrieveResponse
from app.services.rag import RAGService, get_rag_service

logger = structlog.get_logger()

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_context(
    request: RetrieveRequest,
    rag_service: RAGService = Depends(get_rag_service),
) -> RetrieveResponse:
    """Retrieve relevant context and sources for a query."""
    try:
        docs = rag_service.retrieve(
            request.query,
            k=request.k,
            score_threshold=request.score_threshold,
        )
        sources = rag_service.extract_sources(docs)
        context = rag_service.format_context(docs)
        return RetrieveResponse(
            query=request.query,
            context=context,
            sources=sources,
            match_count=len(sources),
        )
    except FileNotFoundError as e:
        logger.error("retrieve_vectorstore_missing", error=str(e))
        raise HTTPException(
            status_code=503,
            detail="Vector store not initialized. Please run ingestion first.",
        )
    except Exception as e:
        logger.error("retrieve_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
