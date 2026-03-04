import { describe, expect, it } from "vitest";
import { snapshotFromThread } from "@/lib/mode-service";

describe("snapshotFromThread", () => {
  it("returns stored mode snapshot for historical thread behavior", () => {
    const snapshot = snapshotFromThread({
      modeId: "mode-123",
      modeNameSnapshot: "Stoic Coach",
      modeSlugSnapshot: "stoic-coach",
      modeDescriptionSnapshot: "Structured",
      modePromptSnapshot: [
        {
          id: "prompt-1",
          name: "Core",
          role: "SYSTEM",
          content: "Guide calmly",
          order: 0,
        },
      ],
      modeSkillSnapshot: [
        {
          id: "skill-1",
          name: "Reframe",
          description: "",
          body: "Reframe",
          order: 0,
        },
      ],
    });

    expect(snapshot.modeName).toBe("Stoic Coach");
    expect(snapshot.prompts).toHaveLength(1);
    expect(snapshot.skills).toHaveLength(1);
  });

  it("falls back to empty arrays when snapshots are invalid", () => {
    const snapshot = snapshotFromThread({
      modeId: null,
      modeNameSnapshot: "Legacy",
      modeSlugSnapshot: "legacy",
      modeDescriptionSnapshot: "Legacy mode",
      modePromptSnapshot: null,
      modeSkillSnapshot: {},
    });

    expect(snapshot.prompts).toEqual([]);
    expect(snapshot.skills).toEqual([]);
  });
});
