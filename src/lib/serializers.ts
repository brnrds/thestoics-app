import type {
  ConversationThread,
  InteractionMode,
  Message,
  ModePrompt,
  ModeSkill,
  Prompt,
  Skill,
} from "@prisma/client";
import type { ModeSnapshot } from "@/lib/prompt-assembly";
import { snapshotFromThread, toModeSnapshot, type InteractionModeWithRelations } from "@/lib/mode-service";

export function serializePrompt(prompt: Prompt) {
  return {
    id: prompt.id,
    name: prompt.name,
    role: prompt.role,
    content: prompt.content,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

export function serializeSkill(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    body: skill.body,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}

export function serializeMode(mode: InteractionModeWithRelations) {
  const snapshot = toModeSnapshot(mode);
  return {
    id: mode.id,
    name: mode.name,
    slug: mode.slug,
    description: mode.description,
    active: mode.active,
    isDefault: mode.isDefault,
    prompts: snapshot.prompts,
    skills: snapshot.skills,
    createdAt: mode.createdAt,
    updatedAt: mode.updatedAt,
  };
}

export type ThreadWithMessages = ConversationThread & {
  messages: Message[];
};

export function serializeThread(thread: ThreadWithMessages) {
  const snapshot: ModeSnapshot = snapshotFromThread(thread);
  const latestMessage =
    thread.messages.length > 0
      ? thread.messages.reduce((latest, current) =>
          current.createdAt > latest.createdAt ? current : latest
        )
      : null;

  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    modeSnapshot: snapshot,
    messageCount: thread.messages.length,
    latestActivityAt: latestMessage?.createdAt ?? thread.updatedAt,
  };
}

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    citations: Array.isArray(message.citations) ? message.citations : [],
    debugContext: message.debugContext,
    createdAt: message.createdAt,
  };
}

export type ModeLinkPayload = {
  promptIds: string[];
  skillIds: string[];
};

export function toPromptLinks(modeId: string, promptIds: string[]): ModePrompt[] {
  return promptIds.map((promptId, order) => ({
    modeId,
    promptId,
    order,
  })) as ModePrompt[];
}

export function toSkillLinks(modeId: string, skillIds: string[]): ModeSkill[] {
  return skillIds.map((skillId, order) => ({
    modeId,
    skillId,
    order,
  })) as ModeSkill[];
}

export function serializeModeBase(mode: InteractionMode) {
  return {
    id: mode.id,
    name: mode.name,
    slug: mode.slug,
    description: mode.description,
    active: mode.active,
    isDefault: mode.isDefault,
  };
}
