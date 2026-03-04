"""Admin endpoints for managing the vector store."""

from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import ClearResponse, DocumentInfo, DocumentsResponse
from app.services.ingest import IngestService, get_ingest_service

logger = structlog.get_logger()

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/documents", response_model=DocumentsResponse)
async def list_documents(
    ingest_service: IngestService = Depends(get_ingest_service),
) -> DocumentsResponse:
    """List all indexed documents with chunk counts."""
    try:
        stats = ingest_service.get_document_stats()

        documents = []
        for doc in stats["documents"]:
            ingested_at = None
            if doc.get("ingested_at"):
                try:
                    ingested_at = datetime.fromisoformat(doc["ingested_at"])
                except (ValueError, TypeError):
                    pass

            documents.append(
                DocumentInfo(
                    filename=doc["filename"],
                    chunks=doc["chunks"],
                    ingested_at=ingested_at,
                )
            )

        return DocumentsResponse(
            documents=documents,
            total_chunks=stats["total_chunks"],
        )

    except Exception as e:
        logger.error("list_documents_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear", response_model=ClearResponse)
async def clear_vector_store(
    ingest_service: IngestService = Depends(get_ingest_service),
) -> ClearResponse:
    """Clear the entire vector store."""
    try:
        success = ingest_service.clear_vector_store()

        if success:
            logger.info("vectorstore_cleared")
            return ClearResponse(
                status="success",
                message="Vector store cleared",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to clear vector store",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("clear_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}



