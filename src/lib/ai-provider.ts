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

const DEFAULT_SPEECH_MODEL = "tts-1";
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

export function getSpeechModel(modelId: string = DEFAULT_SPEECH_MODEL) {
  assertApiKeyConfigured();
  return openai.speech(
    modelId as "tts-1" | "tts-1-1106" | "tts-1-hd" | "tts-1-hd-1106" | "gpt-4o-mini-tts"
  );
}

export function getTranscriptionModel(modelId: string = DEFAULT_TRANSCRIPTION_MODEL) {
  assertApiKeyConfigured();
  return openai.transcription(
    modelId as "whisper-1" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe"
  );
}
