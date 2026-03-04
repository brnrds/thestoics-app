import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, conflict, internalError } from "@/lib/http";
import { skillInputSchema } from "@/lib/schemas";
import { serializeSkill } from "@/lib/serializers";

export async function GET() {
  const skills = await db.skill.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ skills: skills.map(serializeSkill) });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = skillInputSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid skill payload", parsed.error.flatten());
  }

  try {
    const skill = await db.skill.create({ data: parsed.data });
    return NextResponse.json({ skill: serializeSkill(skill) }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return conflict("Skill name must be unique.");
    }

    return internalError("Failed to create skill.", error instanceof Error ? error.message : error);
  }
}
