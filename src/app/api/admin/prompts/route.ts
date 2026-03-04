import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, conflict, internalError } from "@/lib/http";
import { promptInputSchema } from "@/lib/schemas";
import { serializePrompt } from "@/lib/serializers";

export async function GET() {
  const prompts = await db.prompt.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ prompts: prompts.map(serializePrompt) });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = promptInputSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid prompt payload", parsed.error.flatten());
  }

  try {
    const prompt = await db.prompt.create({
      data: parsed.data,
    });

    return NextResponse.json({ prompt: serializePrompt(prompt) }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return conflict("Prompt name must be unique.");
    }

    return internalError("Failed to create prompt.", error instanceof Error ? error.message : error);
  }
}
