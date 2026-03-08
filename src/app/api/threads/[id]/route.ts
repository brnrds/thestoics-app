import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { authErrorToResponse, requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, internalError, notFound } from "@/lib/http";
import { discardLegacyThreads } from "@/lib/legacy-thread-cleanup";
import { threadUpdateSchema } from "@/lib/schemas";
import { serializeMessage, serializeThread } from "@/lib/serializers";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    await discardLegacyThreads();
    const { id } = await params;
    const { appUser } = await requireCurrentUser(_request);

    const thread = await db.conversationThread.findFirst({
      where: {
        id,
        userId: appUser.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!thread) {
      return notFound("Thread not found.");
    }

    return NextResponse.json({
      thread: serializeThread(thread),
      messages: thread.messages.map(serializeMessage),
    });
  } catch (error) {
    const response = authErrorToResponse(error);
    if (response) {
      return response;
    }

    throw error;
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await discardLegacyThreads();
    const { id } = await params;
    const { appUser } = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);
    const parsed = threadUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return badRequest("Invalid thread update payload", parsed.error.flatten());
    }

    const existingThread = await db.conversationThread.findFirst({
      where: {
        id,
        userId: appUser.id,
      },
    });

    if (!existingThread) {
      return notFound("Thread not found.");
    }

    const thread = await db.conversationThread.update({
      where: { id: existingThread.id },
      data: {
        title: parsed.data.title,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ thread: serializeThread(thread) });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Thread not found.");
    }

    return internalError("Failed to rename thread.", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await discardLegacyThreads();
    const { id } = await params;
    const { appUser } = await requireCurrentUser(_request);

    const deleted = await db.conversationThread.deleteMany({
      where: {
        id,
        userId: appUser.id,
      },
    });

    if (deleted.count === 0) {
      return notFound("Thread not found.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Thread not found.");
    }

    return internalError("Failed to delete thread.", error instanceof Error ? error.message : error);
  }
}
