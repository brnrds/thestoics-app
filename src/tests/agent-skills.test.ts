import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSkillsPrompt,
  discoverFileSystemSkills,
  mergeSkills,
  snapshotSkillsToRuntimeSkills,
} from "@/lib/agent-skills";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("agent skills", () => {
  it("discovers skills from the filesystem", async () => {
    const root = await mkdtemp(join(tmpdir(), "stoics-skill-test-"));
    tempDirs.push(root);

    const skillDir = join(root, "close-reading");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: close-reading
description: Compare passages carefully.
---

# Close Reading

Read passages closely and preserve distinctions between authors.
`,
      "utf8"
    );

    const skills = await discoverFileSystemSkills([root]);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("close-reading");
    expect(skills[0].description).toBe("Compare passages carefully.");
    expect(skills[0].body).toContain("Read passages closely");
  });

  it("merges discovered and snapshot skills by unique name", () => {
    const snapshotSkills = snapshotSkillsToRuntimeSkills({
      modeId: "mode-1",
      modeName: "Stoic Coach",
      modeSlug: "stoic-coach",
      modeDescription: "Structured",
      prompts: [],
      skills: [
        {
          id: "skill-1",
          name: "mode-reflection",
          description: "Mode-specific reflection",
          body: "Reflect carefully.",
          order: 0,
        },
      ],
    });

    const merged = mergeSkills(
      [
        {
          name: "close-reading",
          description: "Compare passages carefully",
          body: "Use careful textual comparison.",
        },
      ],
      snapshotSkills,
      [
        {
          name: "close-reading",
          description: "Duplicate should be ignored",
          body: "Duplicate",
        },
      ]
    );

    expect(merged.map((skill) => skill.name)).toEqual([
      "close-reading",
      "mode-reflection",
    ]);
  });

  it("builds an AI SDK style skills prompt", () => {
    const prompt = buildSkillsPrompt([
      {
        name: "close-reading",
        description: "Compare passages carefully.",
      },
      {
        name: "mode-reflection",
        description: "Use the mode's reflection pattern.",
      },
    ]);

    expect(prompt).toContain("## Skills");
    expect(prompt).toContain("Use the `loadSkill` tool");
    expect(prompt).toContain("close-reading");
    expect(prompt).toContain("mode-reflection");
  });
});
