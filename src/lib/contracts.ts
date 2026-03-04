import type { PromptRole } from "@prisma/client";
import type { ModeSnapshot } from "@/lib/prompt-assembly";

export type PromptRecord = {
  id: string;
  name: string;
  role: PromptRole;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotPromptRecord = {
  id: string;
  name: string;
  role: string;
  content: string;
  order: number;
};

export type SnapshotSkillRecord = {
  id: string;
  name: string;
  description: string;
  body: string;
  order: number;
};

export type InteractionModeRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  isDefault: boolean;
  prompts: SnapshotPromptRecord[];
  skills: SnapshotSkillRecord[];
  createdAt: string;
  updatedAt: string;
};

export type ActiveModeRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  isDefault: boolean;
};

export type Citation = {
  source: string;
  excerpt: string;
  page?: number | null;
};

export type ThreadRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  modeSnapshot: ModeSnapshot;
  messageCount: number;
  latestActivityAt: string;
};

export type MessageRecord = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  debugContext?: unknown;
  createdAt: string;
};
