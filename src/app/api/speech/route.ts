import {
  experimental_generateSpeech as generateSpeech,
  NoSpeechGeneratedError,
} from "ai";
import { NextResponse } from "next/server";
import { getSpeechModel, MissingApiKeyError } from "@/lib/ai-provider";

const NO_SPEECH_REMEDIATION =
  "The model failed to generate valid audio. Try different text or a different voice.";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { text, model = "tts-1", voice = "alloy" } = body as {
      text?: string;
      model?: string;
      voice?: string;
    };

    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      return NextResponse.json(
        {
          error: "Text is required",
          hint: "Provide non-empty text to convert to speech.",
        },
        { status: 400 }
      );
    }

    const speech = await generateSpeech({
      model: getSpeechModel(model),
      text: trimmed,
      voice,
    });

    const base64 = speech.audio.base64;
    const mimeType = speech.audio.mediaType ?? "audio/mp3";

    return NextResponse.json({
      base64,
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        {
          error: error.message,
          remediation: error.remediation,
          hint: "Set OPENAI_API_KEY in .env.local.",
        },
        { status: 503 }
      );
    }

    if (NoSpeechGeneratedError.isInstance(error)) {
      return NextResponse.json(
        {
          error: "No speech was generated.",
          remediation: NO_SPEECH_REMEDIATION,
          hint: error.cause ? String(error.cause) : NO_SPEECH_REMEDIATION,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Speech generation failed.",
      },
      { status: 500 }
    );
  }
}
