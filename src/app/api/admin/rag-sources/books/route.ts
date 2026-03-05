import { NextResponse } from "next/server";
import { internalError } from "@/lib/http";
import { loadRagSourceCatalog } from "@/lib/rag-source-catalog";

export async function GET() {
  try {
    const catalog = await loadRagSourceCatalog();
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return internalError(
      "Failed to load RAG source catalog.",
      error instanceof Error ? error.message : error
    );
  }
}
