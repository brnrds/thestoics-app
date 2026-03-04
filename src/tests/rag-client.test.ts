import { describe, expect, it } from "vitest";
import { normalizeRagResponse, parseRagStreamEvents } from "@/lib/rag-client";

describe("rag client normalization", () => {
  it("normalizes rag-server chat response payload", () => {
    const normalized = normalizeRagResponse({
      response: "Answer",
      conversation_id: "abc",
      sources: [
        { source: "Meditations", excerpt: "You have power over your mind.", page: 23 },
      ],
    });

    expect(normalized.response).toBe("Answer");
    expect(normalized.sources).toHaveLength(1);
    expect(normalized.sources[0].source).toBe("Meditations");
    expect(normalized.conversation_id).toBe("abc");
  });

  it("parses streaming source events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"token","content":"Hello"}\n'));
        controller.enqueue(
          encoder.encode(
            '{"type":"sources","content":[{"source":"Discourses","excerpt":"Train desires.","page":7}]}\n'
          )
        );
        controller.enqueue(encoder.encode('{"type":"token","content":" world"}\n'));
        controller.close();
      },
    });

    const parsed = await parseRagStreamEvents(stream);
    expect(parsed.response).toBe("Hello world");
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0].source).toBe("Discourses");
  });
});
