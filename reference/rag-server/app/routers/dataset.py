"""Endpoints for managing the synthetic dataset."""

import asyncio
from uuid import uuid4

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.models.schemas import (
    ExportRequest,
    GenerateRequest,
    GenerateTaskStatus,
    SyntheticDataPair,
)
from app.services.dataset import DatasetService, get_dataset_service

logger = structlog.get_logger()

router = APIRouter(prefix="/dataset", tags=["dataset"])

# In-memory task store for generation tasks
generation_tasks: dict[str, GenerateTaskStatus] = {}


async def run_generation(task_id: str, request: GenerateRequest) -> None:
    """Background task that runs generation and updates task status."""
    task = generation_tasks[task_id]
    task.status = "running"
    
    try:
        # Get the dataset service
        dataset_service = get_dataset_service()
        
        # Map topicMode to the expected format (new and legacy modes)
        topic_map = {
            "classic_random": "classic_random",
            "classic": "classic",
            "tone": "tone",
            "foundation": "foundation",
            # Legacy mappings for backwards compatibility
            "ai": "ai",
            "educational": "educational",
        }
        topic = topic_map.get(request.topicMode, "classic_random")
        
        # Run the generation (this is synchronous in the service)
        # Wrap in asyncio.to_thread to not block
        results = await asyncio.to_thread(
            dataset_service.generate_batch,
            count=request.count,
            model=request.model,
            topic=topic,
            collection_name=request.collection,
            source_content=request.sourceContent,
            system_prompt_override=request.systemPromptOverride,
        )
        
        # Update task with results
        task.progress["completed"] = len(results)
        task.status = "completed"
        task.results = [r.model_dump(by_alias=True) for r in results]
        
        logger.info("generation_completed", task_id=task_id, count=len(results))
        
    except Exception as e:
        logger.error("generation_failed", task_id=task_id, error=str(e))
        task.status = "failed"
        task.error = str(e)


@router.post("/generate")
async def start_generation(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Start a background generation task. Returns taskId for polling."""
    # Valid topic modes (new + legacy for backwards compatibility)
    valid_modes = ["classic_random", "classic", "tone", "foundation", "ai", "educational"]
    
    # Validate topicMode
    if request.topicMode not in valid_modes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid topicMode: {request.topicMode}. Must be one of: {', '.join(valid_modes)}",
        )
    
    # "classic" (document selection) is not yet implemented
    if request.topicMode == "classic":
        raise HTTPException(
            status_code=400,
            detail="Document selection mode is coming soon. Use 'classic_random' for random corpus chunks.",
        )
    
    task_id = str(uuid4())
    generation_tasks[task_id] = GenerateTaskStatus(
        taskId=task_id,
        status="pending",
        progress={"completed": 0, "total": request.count},
    )
    
    background_tasks.add_task(run_generation, task_id, request)
    
    logger.info(
        "generation_started",
        task_id=task_id,
        count=request.count,
        topic=request.topicMode,
        collection=request.collection,
    )
    return {"taskId": task_id}


@router.get("/generate/{task_id}")
async def get_generation_status(task_id: str) -> GenerateTaskStatus:
    """Get the status of a generation task."""
    if task_id not in generation_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return generation_tasks[task_id]


@router.post("/export")
async def export_dataset(request: ExportRequest) -> dict:
    """Convert training examples to OpenAI fine-tuning format."""
    openai_format = []
    
    for ex in request.examples:
        openai_format.append({
            "messages": [
                {"role": "system", "content": request.system_prompt or ""},
                {"role": "user", "content": ex.user_question},
                {"role": "assistant", "content": ex.assistant_response},
            ]
        })
    
    return {"openaiFormat": openai_format}


@router.get("/drafts", response_model=list[SyntheticDataPair])
async def list_drafts(
    dataset_service: DatasetService = Depends(get_dataset_service),
) -> list[SyntheticDataPair]:
    """List all pending draft pairs."""
    return dataset_service.get_drafts()


@router.post("/{id}/approve")
async def approve_pair(
    id: str,
    dataset_service: DatasetService = Depends(get_dataset_service),
):
    """Approve a draft pair and move it to the final dataset."""
    success = dataset_service.approve_pair(id)
    if not success:
        raise HTTPException(status_code=404, detail="Pair not found")
    return {"status": "success"}


@router.post("/approve-all")
async def approve_all(
    dataset_service: DatasetService = Depends(get_dataset_service),
):
    """Approve all pending draft pairs."""
    drafts = dataset_service.get_drafts()
    count = 0
    for draft in drafts:
        dataset_service.approve_pair(str(draft.id))
        count += 1
    return {"status": "success", "count": count}


@router.delete("/{id}")
async def reject_pair(
    id: str,
    dataset_service: DatasetService = Depends(get_dataset_service),
):
    """Reject and delete a draft pair."""
    success = dataset_service.reject_pair(id)
    if not success:
        raise HTTPException(status_code=404, detail="Pair not found")
    return {"status": "success"}
