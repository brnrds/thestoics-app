import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound, internalError } from "@/lib/http";
import { promptInputSchema } from "@/lib/schemas";
import { serializePrompt } from "@/lib/serializers";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const prompt = await db.prompt.findUnique({ where: { id } });

  if (!prompt) {
    return notFound("Prompt not found.");
  }

  return NextResponse.json({ prompt: serializePrompt(prompt) });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = promptInputSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid prompt payload", parsed.error.flatten());
  }

  try {
    const prompt = await db.prompt.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ prompt: serializePrompt(prompt) });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Prompt not found.");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return conflict("Prompt name must be unique.");
    }

    return internalError("Failed to update prompt.", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  try {
    await db.prompt.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Prompt not found.");
    }

    return internalError("Failed to delete prompt.", error instanceof Error ? error.message : error);
  }
}
