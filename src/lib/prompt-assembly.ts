export type SnapshotPrompt = {
  id: string;
  name: string;
  role: string;
  content: string;
  order: number;
};

export type SnapshotSkill = {
  id: string;
  name: string;
  description: string;
  body: string;
  order: number;
};

export type ModeSnapshot = {
  modeId: string | null;
  modeName: string;
  modeSlug: string;
  modeDescription: string;
  prompts: SnapshotPrompt[];
  skills: SnapshotSkill[];
};

export type AssembledContext = {
  text: string;
  debug: {
    orderedPrompts: Array<{ name: string; role: string; order: number }>;
    orderedSkills: Array<{ name: string; order: number }>;
  };
};

function stablePromptSort(a: SnapshotPrompt, b: SnapshotPrompt): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name);
}

function stableSkillSort(a: SnapshotSkill, b: SnapshotSkill): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name);
}

export function assembleModeContext(snapshot: ModeSnapshot): AssembledContext {
  const orderedPrompts = [...snapshot.prompts].sort(stablePromptSort);
  const orderedSkills = [...snapshot.skills].sort(stableSkillSort);

  const promptSection =
    orderedPrompts.length > 0
      ? orderedPrompts
          .map(
            (prompt, index) =>
              `Prompt ${index + 1} (${prompt.role} - ${prompt.name}):\n${prompt.content}`
          )
          .join("\n\n")
      : "No prompts configured for this mode.";

  const skillSection =
    orderedSkills.length > 0
      ? orderedSkills
          .map(
            (skill, index) =>
              `Skill ${index + 1} (${skill.name}):\n${skill.description}`
          )
          .join("\n\n")
      : "No skills configured for this mode.";

  const text = [
    `Interaction Mode: ${snapshot.modeName} (${snapshot.modeSlug})`,
    `Mode Description: ${snapshot.modeDescription}`,
    "",
    "Configured Prompts:",
    promptSection,
    "",
    "Configured Skill Metadata:",
    skillSection,
    "",
    "RAG policy: Retrieval is always enabled for this product and citations must be grounded in returned sources.",
  ].join("\n");

  return {
    text,
    debug: {
      orderedPrompts: orderedPrompts.map((prompt) => ({
        name: prompt.name,
        role: prompt.role,
        order: prompt.order,
      })),
      orderedSkills: orderedSkills.map((skill) => ({
        name: skill.name,
        order: skill.order,
      })),
    },
  };
}
