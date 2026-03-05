import {
  experimental_transcribe as transcribe,
  NoTranscriptGeneratedError,
} from "ai";
import { NextResponse } from "next/server";
import { getTranscriptionModel, MissingApiKeyError } from "@/lib/ai-provider";

const ALLOWED_EXTENSIONS = [
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
];

const NO_TRANSCRIPT_REMEDIATION =
  "The model could not generate a transcript. Try a clearer recording in a supported format.";

function isAllowedFile(file: File): { allowed: boolean; reason?: string } {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (!ext) {
    return {
      allowed: false,
      reason: "File type could not be determined from filename.",
    };
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      allowed: false,
      reason: `Unsupported file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }

  if (file.size === 0) {
    return { allowed: false, reason: "File is empty." };
  }

  return { allowed: true };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const model = (formData.get("model") as string) || "whisper-1";

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json(
        {
          error: "Audio file is required.",
          hint: "Upload an audio file in the `audio` field.",
        },
        { status: 400 }
      );
    }

    const { allowed, reason } = isAllowedFile(audioFile);
    if (!allowed) {
      return NextResponse.json(
        {
          error: reason ?? "Unsupported file type.",
          hint: "Use mp3, mp4, mpeg, mpga, m4a, wav, or webm.",
        },
        { status: 400 }
      );
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const transcript = await transcribe({
      model: getTranscriptionModel(model),
      audio: new Uint8Array(audioBuffer),
    });

    const text = transcript.text?.trim();
    if (!text) {
      return NextResponse.json(
        {
          error: "No transcript was generated.",
          remediation: NO_TRANSCRIPT_REMEDIATION,
          hint: "The recording may be empty, inaudible, or unsupported.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      text,
      segments: transcript.segments,
      language: transcript.language,
      durationInSeconds: transcript.durationInSeconds,
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

    if (NoTranscriptGeneratedError.isInstance(error)) {
      return NextResponse.json(
        {
          error: "No transcript was generated.",
          remediation: NO_TRANSCRIPT_REMEDIATION,
          hint: error.cause ? String(error.cause) : NO_TRANSCRIPT_REMEDIATION,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Transcription failed.",
      },
      { status: 500 }
    );
  }
}
