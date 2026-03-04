import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { getModeForNewThread, toModeSnapshot } from "@/lib/mode-service";
import { threadCreateSchema } from "@/lib/schemas";
import { serializeThread } from "@/lib/serializers";

export async function GET() {
  const threads = await db.conversationThread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ threads: threads.map(serializeThread) });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = threadCreateSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid thread payload", parsed.error.flatten());
  }

  const mode = await getModeForNewThread(parsed.data.modeId);

  if (!mode) {
    return badRequest("A valid active interaction mode is required to create a thread.");
  }

  const snapshot = toModeSnapshot(mode);

  const thread = await db.conversationThread.create({
    data: {
      title: parsed.data.title,
      modeId: mode.id,
      modeNameSnapshot: snapshot.modeName,
      modeSlugSnapshot: snapshot.modeSlug,
      modeDescriptionSnapshot: snapshot.modeDescription,
      modePromptSnapshot: snapshot.prompts,
      modeSkillSnapshot: snapshot.skills,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ thread: serializeThread(thread) }, { status: 201 });
}
