"""Ingestion endpoint for processing documents."""

import tempfile
from pathlib import Path
from typing import Optional

import structlog
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile

from app.models.schemas import ClearCollectionRequest, IngestRequest, IngestResponse
from app.services.ingest import IngestService, get_ingest_service

logger = structlog.get_logger()

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.get("/stats")
async def get_stats(
    collection: str,
    ingest_service: IngestService = Depends(get_ingest_service),
) -> dict:
    """Return document count and chunk stats for a collection."""
    try:
        stats = ingest_service.get_document_stats(collection_name=collection)
        return stats
    except Exception as e:
        logger.error("stats_error", error=str(e), collection=collection)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear")
async def clear_collection(
    body: ClearCollectionRequest,
    ingest_service: IngestService = Depends(get_ingest_service),
) -> dict:
    """Clear all documents from a collection. Requires confirm=true."""
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Must confirm deletion with confirm=true")
    
    try:
        success = ingest_service.clear_vector_store(collection_name=body.collection)
        if success:
            logger.info("collection_cleared", collection=body.collection)
            return {"status": "success", "message": f"Collection '{body.collection}' cleared"}
        else:
            raise HTTPException(status_code=500, detail="Failed to clear collection")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("clear_error", error=str(e), collection=body.collection)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=IngestResponse)
async def ingest_documents(
    file: Optional[UploadFile] = File(None),
    collection_name: Optional[str] = Form(None),
    request: Optional[IngestRequest] = Body(None),
    ingest_service: IngestService = Depends(get_ingest_service),
) -> IngestResponse:
    """
    Ingest documents into the vector store.
    
    Can accept either:
    - A file upload (with collection_name parameter)
    - A directory path (via request body)
    
    Processes PDFs, text files, and markdown files.
    """
    try:
        # Handle file upload
        if file and file.filename:
            if not collection_name:
                raise HTTPException(
                    status_code=400,
                    detail="collection_name is required when uploading a file",
                )
            # Save uploaded file to temp location
            suffix = Path(file.filename).suffix if file.filename else ""
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                tmp_path = Path(tmp_file.name)
                content = await file.read()
                tmp_path.write_bytes(content)
            
            try:
                logger.info("file_upload_started", filename=file.filename, collection=collection_name)
                result = ingest_service.ingest_file(
                    tmp_path, 
                    collection_name=collection_name,
                    original_filename=file.filename
                )
                
                logger.info(
                    "file_upload_complete",
                    status=result["status"],
                    files=result["files_processed"],
                    chunks=result["chunks_created"],
                    collection=collection_name,
                )
                
                return IngestResponse(**result)
            finally:
                # Clean up temp file
                if tmp_path.exists():
                    tmp_path.unlink()
        
        # Handle directory ingestion (existing behavior)
        data_dir = None
        if request and request.directory:
            data_dir = Path(request.directory)
            if not data_dir.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Directory not found: {request.directory}",
                )

        logger.info("ingestion_started", directory=str(data_dir))

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



