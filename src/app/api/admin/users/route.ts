import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upsertSeedUser } from "@/lib/dev-user-seeding";
import { badRequest, internalError } from "@/lib/http";
import { adminUserSeedSchema } from "@/lib/schemas";
import { serializeAdminUser } from "@/lib/serializers";

export async function GET() {
  const users = await db.user.findMany({
    include: {
      _count: {
        select: {
          threads: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { email: "asc" }],
  });

  return NextResponse.json({
    users: users.map(serializeAdminUser),
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = adminUserSeedSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid user seed payload", parsed.error.flatten());
  }

  try {
    const user = await upsertSeedUser(parsed.data);
    const hydratedUser = await db.user.findUnique({
      where: { id: user.id },
      include: {
        _count: {
          select: {
            threads: true,
          },
        },
      },
    });

    if (!hydratedUser) {
      return internalError("Failed to load seeded user after save.");
    }

    return NextResponse.json(
      {
        user: serializeAdminUser(hydratedUser),
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return badRequest("A user with this stub identity already exists.");
    }

    return internalError(
      "Failed to seed user.",
      error instanceof Error ? error.message : error
    );
  }
}
