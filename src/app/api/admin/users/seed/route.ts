import { NextResponse } from "next/server";
import { seedDefaultDevUsers } from "@/lib/dev-user-seeding";
import { internalError } from "@/lib/http";
import { serializeAdminUser } from "@/lib/serializers";

export async function POST() {
  try {
    const users = await seedDefaultDevUsers();

    return NextResponse.json({
      users: users.map(serializeAdminUser),
    });
  } catch (error) {
    return internalError(
      "Failed to seed default development users.",
      error instanceof Error ? error.message : error
    );
  }
}
