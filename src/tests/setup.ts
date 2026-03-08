import { afterEach, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { resetLegacyThreadCleanupForTests } from "@/lib/legacy-thread-cleanup";

beforeAll(async () => {
  await db.$connect();
  await db.message.deleteMany();
  await db.conversationThread.deleteMany();
  await db.user.deleteMany();
  await db.modePrompt.deleteMany();
  await db.modeSkill.deleteMany();
  await db.interactionMode.deleteMany();
  await db.prompt.deleteMany();
  await db.skill.deleteMany();
});

afterEach(async () => {
  await db.message.deleteMany();
  await db.conversationThread.deleteMany();
  await db.user.deleteMany();
  await db.modePrompt.deleteMany();
  await db.modeSkill.deleteMany();
  await db.interactionMode.deleteMany();
  await db.prompt.deleteMany();
  await db.skill.deleteMany();
  resetLegacyThreadCleanupForTests();
});
