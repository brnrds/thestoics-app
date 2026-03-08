import { NextResponse } from "next/server";
import { authErrorToResponse, requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { discardLegacyThreads } from "@/lib/legacy-thread-cleanup";
import { getModeForNewThread, toModeSnapshot } from "@/lib/mode-service";
import { threadCreateSchema } from "@/lib/schemas";
import { serializeThread } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    await discardLegacyThreads();
    const { appUser } = await requireCurrentUser(request);

    const threads = await db.conversationThread.findMany({
      where: { userId: appUser.id },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ threads: threads.map(serializeThread) });
  } catch (error) {
    const response = authErrorToResponse(error);
    if (response) {
      return response;
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    await discardLegacyThreads();
    const { appUser } = await requireCurrentUser(request);
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
        userId: appUser.id,
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
  } catch (error) {
    const response = authErrorToResponse(error);
    if (response) {
      return response;
    }

    throw error;
  }
}
