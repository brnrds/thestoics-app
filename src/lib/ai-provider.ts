import { createOpenAI } from "@ai-sdk/openai";

const REMEDIATION = "Set OPENAI_API_KEY in your .env.local file.";

export class MissingApiKeyError extends Error {
  readonly remediation = REMEDIATION;

  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "MissingApiKeyError";
  }
}

export function assertApiKeyConfigured() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new MissingApiKeyError();
  }
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function getModel(modelId = process.env.OPENAI_MODEL || "gpt-4o-mini") {
  assertApiKeyConfigured();
  return openai(modelId);
}
