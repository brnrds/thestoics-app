"""Fine-tuning endpoints for OpenAI integration."""

import json
import os
import tempfile
from functools import lru_cache

import structlog
from fastapi import APIRouter, HTTPException
from openai import OpenAI

from app.models.schemas import SubmitRequest, UploadRequest

logger = structlog.get_logger()

router = APIRouter(prefix="/finetune", tags=["finetune"])


@lru_cache
def get_openai_client() -> OpenAI:
    """Lazy initialization of OpenAI client."""
    return OpenAI()


@router.post("/upload")
async def upload_training_file(request: UploadRequest) -> dict:
    """Upload training data to OpenAI and return file ID.
    
    Expects examples in OpenAI chat format:
    [{"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}]
    """
    if not request.examples:
        raise HTTPException(status_code=400, detail="No examples provided")
    
    temp_path = None
    try:
        # Write examples to temp JSONL file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            for example in request.examples:
                f.write(json.dumps(example) + "\n")
            temp_path = f.name
        
        # Upload to OpenAI
        with open(temp_path, "rb") as f:
            response = get_openai_client().files.create(file=f, purpose="fine-tune")
        
        logger.info("file_uploaded", file_id=response.id, examples=len(request.examples))
        return {"fileId": response.id}
    
    except Exception as e:
        logger.error("upload_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    
    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@router.post("/submit")
async def submit_finetune_job(request: SubmitRequest) -> dict:
    """Start a fine-tuning job with OpenAI."""
    try:
        # Build hyperparameters if provided
        hyperparams = request.hyperparameters or {}
        
        job = get_openai_client().fine_tuning.jobs.create(
            training_file=request.file_id,
            model=request.base_model,
            hyperparameters=hyperparams if hyperparams else None,
        )
        
        logger.info("finetune_job_submitted", job_id=job.id, model=request.base_model)
        return {"jobId": job.id}
    
    except Exception as e:
        logger.error("submit_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Job submission failed: {str(e)}")


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str) -> dict:
    """Get current status of a fine-tuning job from OpenAI."""
    try:
        job = get_openai_client().fine_tuning.jobs.retrieve(job_id)
        
        return {
            "id": job.id,
            "status": job.status,
            "fineTunedModelId": job.fine_tuned_model,
            "trainedTokens": job.trained_tokens,
            "error": job.error.message if job.error else None,
            "createdAt": job.created_at,
            "finishedAt": job.finished_at,
        }
    
    except Exception as e:
        logger.error("job_status_error", error=str(e), job_id=job_id)
        raise HTTPException(status_code=404, detail=f"Job not found: {str(e)}")


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict:
    """Cancel a running fine-tuning job."""
    try:
        job = get_openai_client().fine_tuning.jobs.cancel(job_id)
        
        logger.info("finetune_job_cancelled", job_id=job_id)
        return {"status": job.status}
    
    except Exception as e:
        logger.error("cancel_error", error=str(e), job_id=job_id)
        raise HTTPException(status_code=500, detail=f"Cancel failed: {str(e)}")


@router.get("/jobs")
async def list_jobs(limit: int = 10) -> dict:
    """List recent fine-tuning jobs."""
    try:
        jobs = get_openai_client().fine_tuning.jobs.list(limit=limit)
        
        return {
            "jobs": [
                {
                    "id": job.id,
                    "status": job.status,
                    "fineTunedModelId": job.fine_tuned_model,
                    "createdAt": job.created_at,
                }
                for job in jobs.data
            ]
        }
    
    except Exception as e:
        logger.error("list_jobs_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")

