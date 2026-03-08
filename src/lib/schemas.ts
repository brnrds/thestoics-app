import { PromptRole, UserRole } from "@prisma/client";
import { z } from "zod";

const requiredText = (fieldLabel: string) =>
  z
    .string()
    .trim()
    .min(1, `${fieldLabel} is required.`);

export const promptInputSchema = z.object({
  name: requiredText("Prompt name"),
  role: z.nativeEnum(PromptRole),
  content: requiredText("Prompt content"),
});

export const skillInputSchema = z.object({
  name: requiredText("Skill name"),
  description: requiredText("Skill description"),
  body: requiredText("Instruction body"),
});

export const modeInputSchema = z.object({
  name: requiredText("Mode name"),
  slug: z
    .string()
    .trim()
    .min(1, "Mode slug is required.")
    .regex(/^[a-z0-9-]+$/, "Slug can only include lowercase letters, numbers, and hyphens."),
  description: requiredText("Mode description"),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  promptIds: z.array(z.string().min(1)).default([]),
  skillIds: z.array(z.string().min(1)).default([]),
});

export const threadCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).default("New Thread"),
  modeId: z.string().min(1).optional(),
});

export const threadUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const sendMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required."),
});

export const retryMessageSchema = z.object({
  messageId: z.string().min(1).optional(),
});

export const adminUserSeedSchema = z.object({
  email: z.email().trim(),
  firstName: z.string().trim().max(80).optional().default(""),
  lastName: z.string().trim().max(80).optional().default(""),
  role: z.nativeEnum(UserRole).default(UserRole.USER),
});
