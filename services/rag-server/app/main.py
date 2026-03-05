"""FastAPI application entry point."""

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ingest, rag

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Create FastAPI app
app = FastAPI(
    title="Stoics RAG API",
    description=(
        "RAG backend for ingesting documents and serving "
        "retrieval context + source citations."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Get settings
settings = get_settings()

# Configure CORS
# For local network development, allow all origins
cors_origins = settings.cors_origins
allow_all = "*" in cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else cors_origins,
    allow_credentials=not allow_all,  # credentials not allowed with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ingest.router)
app.include_router(rag.router)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Stoics RAG API",
        "version": "2.0.0",
        "description": "RAG-only backend (ingest + retrieval)",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    """Simple health check."""
    return {"status": "ok"}


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    logger.info(
        "application_started",
        cors_origins=settings.cors_origins,
        data_path=str(settings.data_path),
        chroma_path=str(settings.chroma_path),
    )


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    logger.info("application_shutdown")
