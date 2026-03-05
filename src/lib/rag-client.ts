import type { RAGRetrieveRequest, RAGRetrieveResponse, RAGSource } from "@/lib/rag/types";

const DEFAULT_TIMEOUT_MS = 6000;

function normalizeSource(source: unknown): RAGSource | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const asRecord = source as Record<string, unknown>;
  const src = typeof asRecord.source === "string" ? asRecord.source : "Unknown source";
  const excerpt = typeof asRecord.excerpt === "string" ? asRecord.excerpt : "";
  const page = typeof asRecord.page === "number" ? asRecord.page : null;

  return { source: src, excerpt, page };
}

export function normalizeRagResponse(input: unknown): RAGRetrieveResponse {
  if (!input || typeof input !== "object") {
    return { query: "", context: "", sources: [], match_count: 0 };
  }

  const payload = input as Record<string, unknown>;
  const query = typeof payload.query === "string" ? payload.query : "";
  const context = typeof payload.context === "string" ? payload.context : "";
  const matchCount =
    typeof payload.match_count === "number" && Number.isFinite(payload.match_count)
      ? payload.match_count
      : 0;

  const rawSources = Array.isArray(payload.sources) ? payload.sources : [];
  const sources = rawSources
    .map((source) => normalizeSource(source))
    .filter((source): source is RAGSource => source !== null);

  return {
    query,
    context,
    sources,
    match_count: matchCount,
  };
}

export async function queryRagService(payload: RAGRetrieveRequest): Promise<{
  available: boolean;
  context: string;
  sources: RAGSource[];
  matchCount: number;
  error?: string;
}> {
  const baseUrl = process.env.RAG_SERVER_URL?.trim();

  if (!baseUrl) {
    return {
      available: false,
      context: "",
      sources: [],
      matchCount: 0,
      error: "RAG_SERVER_URL is not configured.",
    };
  }

  const timeoutMs = Number.parseInt(process.env.RAG_SERVER_TIMEOUT_MS || "", 10);
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${baseUrl}/rag/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        available: false,
        context: "",
        sources: [],
        matchCount: 0,
        error: `RAG service returned ${res.status}`,
      };
    }

    const json = await res.json();
    const normalized = normalizeRagResponse(json);

    return {
      available: true,
      context: normalized.context,
      sources: normalized.sources,
      matchCount: normalized.match_count,
    };
  } catch (error) {
    return {
      available: false,
      context: "",
      sources: [],
      matchCount: 0,
      error: error instanceof Error ? error.message : "Unknown RAG error",
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
