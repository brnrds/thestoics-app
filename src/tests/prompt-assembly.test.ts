import { describe, expect, it } from "vitest";
import { assembleModeContext } from "@/lib/prompt-assembly";

describe("assembleModeContext", () => {
  it("orders prompts and skills deterministically by order then name", () => {
    const result = assembleModeContext({
      modeId: "mode-1",
      modeName: "Stoic Coach",
      modeSlug: "stoic-coach",
      modeDescription: "Structured stoic guidance",
      prompts: [
        { id: "p2", name: "B", role: "SYSTEM", content: "second", order: 1 },
        { id: "p1", name: "A", role: "STYLE", content: "first", order: 1 },
        { id: "p0", name: "Z", role: "SAFETY", content: "zero", order: 0 },
      ],
      skills: [
        { id: "s2", name: "Reflect", description: "", body: "reflect", order: 2 },
        { id: "s1", name: "Act", description: "", body: "act", order: 1 },
      ],
    });

    expect(result.debug.orderedPrompts.map((prompt) => prompt.name)).toEqual(["Z", "A", "B"]);
    expect(result.debug.orderedSkills.map((skill) => skill.name)).toEqual(["Act", "Reflect"]);
    expect(result.text).toContain("RAG policy");
  });

  it("handles missing prompts and skills gracefully", () => {
    const result = assembleModeContext({
      modeId: "mode-1",
      modeName: "Empty Mode",
      modeSlug: "empty-mode",
      modeDescription: "No config",
      prompts: [],
      skills: [],
    });

    expect(result.text).toContain("No prompts configured");
    expect(result.text).toContain("No skills configured");
    expect(result.debug.orderedPrompts).toEqual([]);
    expect(result.debug.orderedSkills).toEqual([]);
  });
});
