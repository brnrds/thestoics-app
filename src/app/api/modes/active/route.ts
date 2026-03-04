import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeModeBase } from "@/lib/serializers";

export async function GET() {
  const modes = await db.interactionMode.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({
    modes: modes.map(serializeModeBase),
  });
}
