import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, internalError, notFound } from "@/lib/http";
import { threadUpdateSchema } from "@/lib/schemas";
import { serializeMessage, serializeThread } from "@/lib/serializers";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const thread = await db.conversationThread.findUnique({
    where: { id },
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
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = threadUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid thread update payload", parsed.error.flatten());
  }

  try {
    const thread = await db.conversationThread.update({
      where: { id },
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
  const { id } = await params;

  try {
    await db.conversationThread.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Thread not found.");
    }

    return internalError("Failed to delete thread.", error instanceof Error ? error.message : error);
  }
}
