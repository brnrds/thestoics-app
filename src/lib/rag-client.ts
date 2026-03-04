import type { RAGChatRequest, RAGChatResponse, RAGSource, RAGStreamEvent } from "@/lib/rag/types";

const DEFAULT_TIMEOUT_MS = 6000;

export class RagUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RagUnavailableError";
  }
}

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

export function normalizeRagResponse(input: unknown): RAGChatResponse {
  if (!input || typeof input !== "object") {
    return { response: "", sources: [] };
  }

  const payload = input as Record<string, unknown>;
  const response = typeof payload.response === "string" ? payload.response : "";
  const conversationId =
    typeof payload.conversation_id === "string" ? payload.conversation_id : undefined;

  const rawSources = Array.isArray(payload.sources) ? payload.sources : [];
  const sources = rawSources
    .map((source) => normalizeSource(source))
    .filter((source): source is RAGSource => source !== null);

  return {
    response,
    sources,
    conversation_id: conversationId,
  };
}

export async function parseRagStreamEvents(body: ReadableStream<Uint8Array>): Promise<{
  response: string;
  sources: RAGSource[];
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let response = "";
  let sources: RAGSource[] = [];

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    text += decoder.decode(chunk.value, { stream: true });
    const lines = text.split("\n");
    text = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const event = JSON.parse(trimmed) as RAGStreamEvent;
        if (event.type === "token" && typeof event.content === "string") {
          response += event.content;
        }
        if (event.type === "sources" && Array.isArray(event.content)) {
          sources = event.content
            .map((source) => normalizeSource(source))
            .filter((source): source is RAGSource => source !== null);
        }
      } catch {
        // Ignore malformed stream lines and continue to preserve chat continuity.
      }
    }
  }

  return { response, sources };
}

export async function queryRagService(payload: RAGChatRequest): Promise<{
  available: boolean;
  response: string;
  sources: RAGSource[];
  error?: string;
}> {
  const baseUrl = process.env.RAG_SERVER_URL?.trim();

  if (!baseUrl) {
    return {
      available: false,
      response: "",
      sources: [],
      error: "RAG_SERVER_URL is not configured.",
    };
  }

  const timeoutMs = Number.parseInt(process.env.RAG_SERVER_TIMEOUT_MS || "", 10);
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${baseUrl}/chat`, {
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
        response: "",
        sources: [],
        error: `RAG service returned ${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type") || "";

    if ((contentType.includes("application/x-ndjson") || contentType.includes("text/event-stream")) && res.body) {
      const streamed = await parseRagStreamEvents(res.body);
      return {
        available: true,
        response: streamed.response,
        sources: streamed.sources,
      };
    }

    const json = await res.json();
    const normalized = normalizeRagResponse(json);

    return {
      available: true,
      response: normalized.response,
      sources: normalized.sources,
    };
  } catch (error) {
    return {
      available: false,
      response: "",
      sources: [],
      error: error instanceof Error ? error.message : "Unknown RAG error",
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
