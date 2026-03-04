import type { InteractionMode, Prompt, Skill } from "@prisma/client";
import { db } from "@/lib/db";
import type { ModeSnapshot, SnapshotPrompt, SnapshotSkill } from "@/lib/prompt-assembly";

export type InteractionModeWithRelations = InteractionMode & {
  modePrompts: Array<{
    order: number;
    prompt: Prompt;
  }>;
  modeSkills: Array<{
    order: number;
    skill: Skill;
  }>;
};

export function slugifyModeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function toModeSnapshot(mode: InteractionModeWithRelations): ModeSnapshot {
  const prompts: SnapshotPrompt[] = mode.modePrompts.map((link) => ({
    id: link.prompt.id,
    name: link.prompt.name,
    role: link.prompt.role,
    content: link.prompt.content,
    order: link.order,
  }));

  const skills: SnapshotSkill[] = mode.modeSkills.map((link) => ({
    id: link.skill.id,
    name: link.skill.name,
    description: link.skill.description,
    body: link.skill.body,
    order: link.order,
  }));

  return {
    modeId: mode.id,
    modeName: mode.name,
    modeSlug: mode.slug,
    modeDescription: mode.description,
    prompts,
    skills,
  };
}

export async function getModeById(id: string): Promise<InteractionModeWithRelations | null> {
  return db.interactionMode.findUnique({
    where: { id },
    include: {
      modePrompts: {
        include: { prompt: true },
      },
      modeSkills: {
        include: { skill: true },
      },
    },
  });
}

export async function getDefaultOrFirstActiveMode(): Promise<InteractionModeWithRelations | null> {
  const mode = await db.interactionMode.findFirst({
    where: { active: true, isDefault: true },
    include: {
      modePrompts: { include: { prompt: true } },
      modeSkills: { include: { skill: true } },
    },
  });

  if (mode) {
    return mode;
  }

  return db.interactionMode.findFirst({
    where: { active: true },
    include: {
      modePrompts: { include: { prompt: true } },
      modeSkills: { include: { skill: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getModeForNewThread(modeId?: string): Promise<InteractionModeWithRelations | null> {
  if (modeId) {
    return db.interactionMode.findFirst({
      where: { id: modeId, active: true },
      include: {
        modePrompts: { include: { prompt: true } },
        modeSkills: { include: { skill: true } },
      },
    });
  }

  return getDefaultOrFirstActiveMode();
}

export function snapshotFromThread(thread: {
  modeId: string | null;
  modeNameSnapshot: string;
  modeSlugSnapshot: string;
  modeDescriptionSnapshot: string;
  modePromptSnapshot: unknown;
  modeSkillSnapshot: unknown;
}): ModeSnapshot {
  const prompts = Array.isArray(thread.modePromptSnapshot)
    ? (thread.modePromptSnapshot as SnapshotPrompt[])
    : [];
  const skills = Array.isArray(thread.modeSkillSnapshot)
    ? (thread.modeSkillSnapshot as SnapshotSkill[])
    : [];

  return {
    modeId: thread.modeId,
    modeName: thread.modeNameSnapshot,
    modeSlug: thread.modeSlugSnapshot,
    modeDescription: thread.modeDescriptionSnapshot,
    prompts,
    skills,
  };
}
