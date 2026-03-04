"""Chat endpoint for conversing with the configured AI persona."""

import json
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.schemas import ChatRequest, ChatResponse, Source, RAGConfig
from app.services.llm import LLMService, get_llm_service

logger = structlog.get_logger()

router = APIRouter(prefix="/chat", tags=["chat"])

# Simple in-memory conversation store (replace with Redis/DB for production)
conversations: dict[str, list[dict]] = {}


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    stream: bool = Query(default=False, description="Enable streaming response"),
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatResponse | StreamingResponse:
    """
    Chat with the configured AI persona.

    Send messages and receive responses based on the project's system prompt and RAG context.
    """
    request_id = str(uuid4())
    logger.info(
        "chat_request",
        request_id=request_id,
        message_length=len(request.message),
        stream=stream,
        use_rag=request.use_rag,
        has_config_a=bool(request.config_a),
        has_config_b=bool(request.config_b),
    )

    # Get or create conversation
    conv_id = str(request.conversation_id) if request.conversation_id else str(uuid4())
    
    # Use provided history (from frontend/database) if available, else fallback to in-memory
    if request.history:
        history = [{"role": msg.role, "content": msg.content} for msg in request.history]
    else:
        history = conversations.get(conv_id, [])

    try:
        if stream:
            # Streaming only supports one response stream at a time for now.
            # If config_a is provided (and no config_b), use it.
            # If config_a and config_b are provided, the client should make two separate requests 
            # (which is how the frontend currently implements compare mode).
            # HOWEVER, to support flexible comparison, we check if a specific config was passed.
            
            # NOTE: The current frontend implementation sends two separate requests for compare mode.
            # One request has useRag=true, the other useRag=false.
            # To support the new playground, the frontend will likely send a single config object 
            # per request (either config_a OR config_b depending on which stream it is).
            
            # Fallback to backward compatible behavior if no explicit config object is passed,
            # but honor the config object if present.
            active_config = request.config_a or RAGConfig(use_rag=request.use_rag)

            return StreamingResponse(
                stream_response(
                    llm_service,
                    request.message,
                    request.model,
                    history,
                    conv_id,
                    active_config,
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Conversation-ID": conv_id,
                },
            )
        else:
            # Non-streaming support
            active_config = request.config_a or RAGConfig(use_rag=request.use_rag)
            
            response_text, sources = llm_service.generate(
                question=request.message,
                model=request.model,
                conversation_history=history,
                config=active_config,
            )

            # Update conversation history
            history.append({"role": "user", "content": request.message})
            history.append({"role": "assistant", "content": response_text})
            conversations[conv_id] = history[-20:]  # Keep last 20 messages

            return ChatResponse(
                response=response_text,
                sources=sources,
                conversation_id=conv_id,
            )

    except FileNotFoundError as e:
        logger.error("vectorstore_missing", error=str(e))
        raise HTTPException(
            status_code=503,
            detail="Vector store not initialized. Please run ingestion first.",
        )
    except Exception as e:
        logger.error("chat_error", request_id=request_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


async def stream_response(
    llm_service: LLMService,
    question: str,
    model: str | None,
    history: list[dict],
    conv_id: str,
    config: RAGConfig,
):
    """Generate SSE stream response."""
    full_response = ""

    try:
        async for content, sources in llm_service.generate_stream(
            question=question,
            model=model,
            conversation_history=history,
            config=config,
        ):
            if content:
                full_response += content
                event = {"type": "token", "content": content}
                yield f"data: {json.dumps(event)}\n\n"

            if sources is not None:
                # Sources come at the end
                sources_data = [s.model_dump() for s in sources]
                event = {"type": "sources", "content": sources_data}
                yield f"data: {json.dumps(event)}\n\n"

        # Update conversation history
        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": full_response})
        conversations[conv_id] = history[-20:]

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error("stream_error", error=str(e))
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"


@router.delete("/conversation/{conversation_id}")
async def clear_conversation(conversation_id: str):
    """Clear a conversation's history."""
    if conversation_id in conversations:
        del conversations[conversation_id]
        return {"status": "success", "message": "Conversation cleared"}
    return {"status": "not_found", "message": "Conversation not found"}
