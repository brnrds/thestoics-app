import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createMode } from "@/lib/mode-persistence";
import { badRequest, conflict, internalError } from "@/lib/http";
import { modeInputSchema } from "@/lib/schemas";
import { serializeMode } from "@/lib/serializers";

export async function GET() {
  const modes = await db.interactionMode.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      modePrompts: {
        include: { prompt: true },
      },
      modeSkills: {
        include: { skill: true },
      },
    },
  });

  return NextResponse.json({
    modes: modes.map(serializeMode),
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = modeInputSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid mode payload", parsed.error.flatten());
  }

  try {
    const mode = await createMode(parsed.data);
    return NextResponse.json({ mode: serializeMode(mode) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid")) {
      return badRequest(error.message);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return conflict("Mode name and slug must be unique.");
    }

    return internalError("Failed to create interaction mode.", error instanceof Error ? error.message : error);
  }
}
