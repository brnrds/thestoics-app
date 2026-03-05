"""Ingestion endpoints for indexing documents into the RAG store."""

import tempfile
from datetime import datetime
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.models.schemas import (
    ClearRequest,
    ClearResponse,
    IngestRequest,
    IngestResponse,
    IngestStatsDocument,
    IngestStatsResponse,
)
from app.services.ingest import IngestService, get_ingest_service

logger = structlog.get_logger()

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.get("/stats", response_model=IngestStatsResponse)
async def get_stats(
    ingest_service: IngestService = Depends(get_ingest_service),
) -> IngestStatsResponse:
    """Return indexed document stats for the default collection."""
    try:
        stats = ingest_service.get_document_stats()
        documents = [
            IngestStatsDocument(
                filename=doc["filename"],
                chunks=doc["chunks"],
                ingested_at=datetime.fromisoformat(doc["ingested_at"]) if doc.get("ingested_at") else None,
            )
            for doc in stats["documents"]
        ]
        return IngestStatsResponse(documents=documents, total_chunks=stats["total_chunks"])
    except Exception as e:
        logger.error("stats_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear", response_model=ClearResponse)
async def clear_index(
    body: ClearRequest,
    ingest_service: IngestService = Depends(get_ingest_service),
) -> ClearResponse:
    """Clear all indexed chunks from the default collection."""
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Must confirm deletion with confirm=true")

    try:
        success = ingest_service.clear_vector_store()
        if success:
            logger.info("vectorstore_cleared")
            return ClearResponse(status="success", message="Vector store cleared")
        raise HTTPException(status_code=500, detail="Failed to clear vector store")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("clear_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/file", response_model=IngestResponse)
async def ingest_uploaded_file(
    file: UploadFile = File(...),
    ingest_service: IngestService = Depends(get_ingest_service),
) -> IngestResponse:
    """Ingest a single uploaded file into the index."""
    try:
        suffix = Path(file.filename).suffix if file.filename else ""
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_path = Path(tmp_file.name)
            content = await file.read()
            tmp_path.write_bytes(content)

        try:
            logger.info("file_upload_started", filename=file.filename)
            result = ingest_service.ingest_file(
                tmp_path,
                original_filename=file.filename,
            )
            logger.info(
                "file_upload_complete",
                status=result["status"],
                files=result["files_processed"],
                chunks=result["chunks_created"],
            )
            return IngestResponse(**result)
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    except HTTPException:
        raise
    except Exception as e:
        logger.error("ingestion_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=IngestResponse)
async def ingest_documents(
    request: IngestRequest | None = None,
    ingest_service: IngestService = Depends(get_ingest_service),
) -> IngestResponse:
    """Ingest documents from a local directory path or from default data path."""
    try:
        data_dir = None
        if request and request.directory:
            data_dir = Path(request.directory)
            if not data_dir.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Directory not found: {request.directory}",
                )

        logger.info("ingestion_started", directory=str(data_dir) if data_dir else None)

        result = ingest_service.ingest(data_dir)

        logger.info(
            "ingestion_complete",
            status=result["status"],
            files=result["files_processed"],
            chunks=result["chunks_created"],
        )

        return IngestResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("ingestion_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
