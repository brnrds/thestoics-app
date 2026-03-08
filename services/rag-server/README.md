# Stoics RAG Server

Retrieval-only backend for the Stoics Next.js app.

## Purpose

- Ingest local content into Chroma embeddings.
- Return retrieval context + citations.
- Do **not** generate chat responses (the Next.js app handles generation with AI SDK).

## Defaults

- `DATA_PATH`: workspace root (repo root locally, `/workspace` in Docker)
- `CHROMA_PATH`: `/Users/bcsantos/Desktop/Kirkpatrick/stoics/services/rag-server/chroma_db`
- Excluded directories during ingestion:
  - `.git`, `node_modules`, `.next`, `.vercel`, `dist`, `build`, `chroma_db`, `__pycache__`, `.pytest_cache`, `.ruff_cache`, `venv`, `.venv`, `htmlcov`

Override via env vars (`DATA_PATH`, `CHROMA_PATH`, `INGEST_EXCLUDED_DIRS_STR`).
For a portable local + container setup, prefer a repo-relative value such as:

```env
DATA_PATH=reference/found-books/human-approved
```

## API

### `POST /rag/retrieve`

Request:

```json
{
  "query": "What does Marcus Aurelius say about control?",
  "k": 5
}
```

Response:

```json
{
  "query": "What does Marcus Aurelius say about control?",
  "context": "[1] Source: meditations.md\n...",
  "sources": [
    {
      "source": "meditations.md",
      "page": null,
      "excerpt": "You have power over your mind..."
    }
  ],
  "match_count": 1
}
```

### Ingestion endpoints

- `POST /ingest` with optional `{ "directory": "/path" }`
- `POST /ingest/file` for single upload
- `GET /ingest/stats`
- `DELETE /ingest/clear` with `{ "confirm": true }`

## Local Run

```bash
cd services/rag-server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Initial ingestion (default `DATA_PATH`):

```bash
python -m app.cli ingest
```
