import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound, internalError } from "@/lib/http";
import { skillInputSchema } from "@/lib/schemas";
import { serializeSkill } from "@/lib/serializers";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const skill = await db.skill.findUnique({ where: { id } });

  if (!skill) {
    return notFound("Skill not found.");
  }

  return NextResponse.json({ skill: serializeSkill(skill) });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = skillInputSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid skill payload", parsed.error.flatten());
  }

  try {
    const skill = await db.skill.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ skill: serializeSkill(skill) });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Skill not found.");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return conflict("Skill name must be unique.");
    }

    return internalError("Failed to update skill.", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  try {
    await db.skill.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound("Skill not found.");
    }

    return internalError("Failed to delete skill.", error instanceof Error ? error.message : error);
  }
}
