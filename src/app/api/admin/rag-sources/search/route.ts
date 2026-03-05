import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, internalError } from "@/lib/http";

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 800;

const requestSchema = z.object({
  query: z.string().trim().min(1, "query is required"),
  count: z.coerce.number().int().min(1).max(20).default(8),
});

type BraveWebResult = {
  url?: unknown;
  title?: unknown;
  description?: unknown;
};

function getBraveApiKey(): string {
  return (
    process.env.BRAVE_API_KEY?.trim() ||
    process.env.BRAVE_SEARCH_API_KEY?.trim() ||
    ""
  );
}

function toSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    return badRequest("Invalid search payload.", parsed.error.flatten());
  }

  const braveApiKey = getBraveApiKey();
  if (!braveApiKey) {
    return internalError(
      "BRAVE_API_KEY is missing. Add it to .env.local to enable source discovery."
    );
  }

  const searchUrl = new URL(BRAVE_API_URL);
  searchUrl.searchParams.set("q", parsed.data.query);
  searchUrl.searchParams.set("count", String(parsed.data.count));

  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(searchUrl.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": braveApiKey,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const responseBody = await response.text();
        lastError = `${response.status}: ${truncate(responseBody)}`;

        if (
          RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt);
          await sleep(backoffMs);
          continue;
        }

        return NextResponse.json(
          { error: "Brave search request failed.", details: lastError },
          { status: 502 }
        );
      }

      const data = (await response.json().catch(() => null)) as
        | {
            web?: {
              results?: BraveWebResult[];
            };
          }
        | null;

      const results = (data?.web?.results ?? [])
        .map((item) => {
          const url = toSafeHttpUrl(item?.url);
          if (!url) {
            return null;
          }

          return {
            url,
            title: typeof item?.title === "string" ? item.title : "",
            description:
              typeof item?.description === "string" ? item.description : "",
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return NextResponse.json({ results }, { status: 200 });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";
      if (attempt < MAX_ATTEMPTS - 1) {
        const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt);
        await sleep(backoffMs);
        continue;
      }
    }
  }

  return internalError("Brave search failed after retries.", lastError);
}
