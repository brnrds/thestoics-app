# Pi RAG Deployment

Run a dedicated Stoics RAG container on `pi` and access it from local development through SSH tunneling.

## 1) Prepare checkout on `pi`

```bash
ssh pi
mkdir -p ~/apps
cd ~/apps
git clone <repo-url> stoics
cd stoics
```

## 2) Configure RAG env on `pi`

```bash
cd ~/apps/stoics/deploy/pi
cp .env.rag.example .env.rag
```

Edit `.env.rag` and set at minimum:

- `OPENAI_API_KEY`
- `DATA_PATH=reference/found-books/human-approved`

## 3) Build and start the RAG service

```bash
cd ~/apps/stoics/deploy/pi
docker compose -f rag.compose.yml up -d --build
docker compose -f rag.compose.yml ps
```

The service publishes only on loopback by default:

- `127.0.0.1:8010 -> 8000` (`PI_RAG_HOST_PORT` can override `8010`)

## 4) Connect from your laptop

Open an SSH tunnel in a separate terminal:

```bash
ssh -N -L 8010:127.0.0.1:8010 pi
```

Then use this in local `.env.local`:

```bash
RAG_SERVER_URL="http://127.0.0.1:8010"
```

## 5) Update workflow

When the corpus or code changes:

```bash
ssh pi
cd ~/apps/stoics
git pull --ff-only
cd deploy/pi
docker compose -f rag.compose.yml up -d --build
```

The RAG container runs ingestion on startup before serving requests.
