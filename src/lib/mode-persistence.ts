import { db } from "@/lib/db";
import type { InteractionModeWithRelations } from "@/lib/mode-service";

export type ModeUpsertInput = {
  name: string;
  slug: string;
  description: string;
  active: boolean;
  isDefault: boolean;
  promptIds: string[];
  skillIds: string[];
};

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

async function assertReferencesExist(promptIds: string[], skillIds: string[]) {
  if (promptIds.length > 0) {
    const count = await db.prompt.count({
      where: { id: { in: promptIds } },
    });

    if (count !== promptIds.length) {
      throw new Error("One or more promptIds are invalid.");
    }
  }

  if (skillIds.length > 0) {
    const count = await db.skill.count({
      where: { id: { in: skillIds } },
    });

    if (count !== skillIds.length) {
      throw new Error("One or more skillIds are invalid.");
    }
  }
}

export async function createMode(input: ModeUpsertInput): Promise<InteractionModeWithRelations> {
  const promptIds = uniqueIds(input.promptIds);
  const skillIds = uniqueIds(input.skillIds);
  await assertReferencesExist(promptIds, skillIds);

  const mode = await db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.interactionMode.updateMany({ data: { isDefault: false } });
    }

    const created = await tx.interactionMode.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        active: input.active,
        isDefault: input.isDefault,
      },
    });

    if (promptIds.length > 0) {
      await tx.modePrompt.createMany({
        data: promptIds.map((promptId, order) => ({
          modeId: created.id,
          promptId,
          order,
        })),
      });
    }

    if (skillIds.length > 0) {
      await tx.modeSkill.createMany({
        data: skillIds.map((skillId, order) => ({
          modeId: created.id,
          skillId,
          order,
        })),
      });
    }

    return tx.interactionMode.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        modePrompts: { include: { prompt: true } },
        modeSkills: { include: { skill: true } },
      },
    });
  });

  return mode;
}

export async function updateMode(id: string, input: ModeUpsertInput): Promise<InteractionModeWithRelations> {
  const promptIds = uniqueIds(input.promptIds);
  const skillIds = uniqueIds(input.skillIds);
  await assertReferencesExist(promptIds, skillIds);

  const mode = await db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.interactionMode.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
    }

    await tx.interactionMode.update({
      where: { id },
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        active: input.active,
        isDefault: input.isDefault,
      },
    });

    await tx.modePrompt.deleteMany({ where: { modeId: id } });
    await tx.modeSkill.deleteMany({ where: { modeId: id } });

    if (promptIds.length > 0) {
      await tx.modePrompt.createMany({
        data: promptIds.map((promptId, order) => ({ modeId: id, promptId, order })),
      });
    }

    if (skillIds.length > 0) {
      await tx.modeSkill.createMany({
        data: skillIds.map((skillId, order) => ({ modeId: id, skillId, order })),
      });
    }

    return tx.interactionMode.findUniqueOrThrow({
      where: { id },
      include: {
        modePrompts: { include: { prompt: true } },
        modeSkills: { include: { skill: true } },
      },
    });
  });

  return mode;
}

export async function deleteMode(id: string): Promise<boolean> {
  const mode = await db.interactionMode.findUnique({ where: { id } });
  if (!mode) {
    return false;
  }

  await db.interactionMode.delete({ where: { id } });

  if (mode.isDefault) {
    const fallback = await db.interactionMode.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });

    if (fallback) {
      await db.interactionMode.update({
        where: { id: fallback.id },
        data: { isDefault: true },
      });
    }
  }

  return true;
}
