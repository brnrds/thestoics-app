import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModeSnapshot, SnapshotSkill } from "@/lib/prompt-assembly";

export type SkillMetadata = {
  name: string;
  description: string;
};

export type RuntimeSkill = SkillMetadata & {
  path?: string;
  body: string;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(content: string): SkillMetadata {
  const match = content.match(FRONTMATTER_RE);
  if (!match?.[1]) {
    throw new Error("No frontmatter found.");
  }

  const nameMatch = match[1].match(/^name:\s*(.+)$/m);
  const descriptionMatch = match[1].match(/^description:\s*(.+)$/m);

  const name = nameMatch?.[1] ? stripQuotes(nameMatch[1]) : "";
  const description = descriptionMatch?.[1] ? stripQuotes(descriptionMatch[1]) : "";

  if (!name || !description) {
    throw new Error("Skill frontmatter must include name and description.");
  }

  return { name, description };
}

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, "").trim();
}

export async function discoverFileSystemSkills(
  directories: string[]
): Promise<RuntimeSkill[]> {
  const skills: RuntimeSkill[] = [];
  const seenNames = new Set<string>();

  for (const directory of directories) {
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = join(directory, String(entry.name));
      const skillFile = join(skillDir, "SKILL.md");

      try {
        const content = await readFile(skillFile, "utf8");
        const metadata = parseFrontmatter(content);
        const normalizedName = metadata.name.toLowerCase();

        if (seenNames.has(normalizedName)) {
          continue;
        }

        seenNames.add(normalizedName);
        skills.push({
          ...metadata,
          path: skillDir,
          body: stripFrontmatter(content),
        });
      } catch {
        continue;
      }
    }
  }

  return skills;
}

export function snapshotSkillsToRuntimeSkills(snapshot: ModeSnapshot): RuntimeSkill[] {
  return snapshot.skills.map((skill: SnapshotSkill) => ({
    name: skill.name,
    description: skill.description,
    body: skill.body,
  }));
}

export function mergeSkills(...collections: RuntimeSkill[][]): RuntimeSkill[] {
  const merged: RuntimeSkill[] = [];
  const seenNames = new Set<string>();

  for (const collection of collections) {
    for (const skill of collection) {
      const normalizedName = skill.name.toLowerCase();
      if (seenNames.has(normalizedName)) {
        continue;
      }
      seenNames.add(normalizedName);
      merged.push(skill);
    }
  }

  return merged;
}

export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return [
      "## Skills",
      "",
      "No extra skills are available for this request.",
    ].join("\n");
  }

  const skillsList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");

  return [
    "## Skills",
    "",
    "Use the `loadSkill` tool when a listed skill would materially improve the answer.",
    "",
    "Available skills:",
    skillsList,
  ].join("\n");
}
