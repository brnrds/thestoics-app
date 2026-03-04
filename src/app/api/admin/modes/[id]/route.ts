import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteMode, updateMode } from "@/lib/mode-persistence";
import { badRequest, conflict, internalError, notFound } from "@/lib/http";
import { modeInputSchema } from "@/lib/schemas";
import { serializeMode } from "@/lib/serializers";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const mode = await db.interactionMode.findUnique({
    where: { id },
    include: {
      modePrompts: { include: { prompt: true } },
      modeSkills: { include: { skill: true } },
    },
  });

  if (!mode) {
    return notFound("Interaction mode not found.");
  }

  return NextResponse.json({ mode: serializeMode(mode) });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = modeInputSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid mode payload", parsed.error.flatten());
  }

  try {
    const mode = await updateMode(id, parsed.data);
    return NextResponse.json({ mode: serializeMode(mode) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid")) {
      return badRequest(error.message);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Interaction mode not found.");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return conflict("Mode name and slug must be unique.");
    }

    return internalError("Failed to update mode.", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const deleted = await deleteMode(id);

  if (!deleted) {
    return notFound("Interaction mode not found.");
  }

  return NextResponse.json({ ok: true });
}
