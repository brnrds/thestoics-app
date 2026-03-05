import { describe, expect, it } from "vitest";
import { normalizeRagResponse } from "@/lib/rag-client";

describe("rag client normalization", () => {
  it("normalizes rag-server retrieval response payload", () => {
    const normalized = normalizeRagResponse({
      query: "What is virtue?",
      context: "[1] Source: Meditations\nYou have power over your mind.",
      match_count: 1,
      sources: [
        { source: "Meditations", excerpt: "You have power over your mind.", page: 23 },
      ],
    });

    expect(normalized.query).toBe("What is virtue?");
    expect(normalized.context).toContain("Meditations");
    expect(normalized.sources).toHaveLength(1);
    expect(normalized.sources[0].source).toBe("Meditations");
    expect(normalized.match_count).toBe(1);
  });
});
