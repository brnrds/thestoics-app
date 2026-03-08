#!/usr/bin/env tsx
/**
 * Uses the RAG source discovery facilities (Brave Search API) to find
 * TEXT format versions of books from reference/books.json.
 * Skips Meditations (already done). Max 10 queries per book.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_QUERIES_PER_BOOK = 10;

type Book = {
  author: string;
  name: string;
  "website-suggested"?: string;
};

type Catalog = {
  websites: string[];
  books: Book[];
};

type SearchResult = {
  url: string;
  title: string;
  description: string;
};

function loadEnv(): void {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = val.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // ignore
  }
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function buildDomainPlan(websiteSuggested: string | undefined, websites: string[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | undefined) => {
    if (!value) return;
    const n = normalizeDomain(value);
    if (!n || seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  };

  add(websiteSuggested);
  websites.forEach((d) => add(d));
  return ordered;
}

function buildSiteQuery(book: Book, domain: string): string {
  return `"${book.name}" "${book.author}" text site:${domain}`;
}

function buildFallbackQuery(book: Book): string {
  return `"${book.name}" "${book.author}" text online`;
}

function buildQueryVariants(book: Book): string[] {
  return [
    `"${book.name}" "${book.author}" full text`,
    `"${book.name}" "${book.author}" plain text`,
    `${book.name} ${book.author} gutenberg`,
    `${book.name} ${book.author} archive.org text`,
  ];
}

async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = new URL(BRAVE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Brave API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
  };

  const results = (data?.web?.results ?? [])
    .map((r) => {
      let u = r?.url;
      if (typeof u !== "string" || !u.trim()) return null;
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return {
          url: parsed.toString(),
          title: typeof r?.title === "string" ? r.title : "",
          description: typeof r?.description === "string" ? r.description : "",
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is SearchResult => r !== null);

  return results;
}

async function main(): Promise<void> {
  loadEnv();

  const apiKey =
    process.env.BRAVE_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    console.error("BRAVE_API_KEY or BRAVE_SEARCH_API_KEY required in .env.local");
    process.exit(1);
  }

  const catalogPath = join(process.cwd(), "reference", "books.json");
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

  const books = catalog.books.filter(
    (b) => !(b.author === "Marcus Aurelius" && b.name === "Meditations")
  );

  const report: Array<{
    book: string;
    author: string;
    queries: number;
    links: SearchResult[];
    error?: string;
  }> = [];

  for (const book of books) {
    const domainPlan = buildDomainPlan(book["website-suggested"], catalog.websites);
    const variants = buildQueryVariants(book);

    const allQueries: string[] = [];
    for (const d of domainPlan) {
      allQueries.push(buildSiteQuery(book, d));
    }
    allQueries.push(buildFallbackQuery(book));
    for (const v of variants) {
      if (allQueries.length >= MAX_QUERIES_PER_BOOK) break;
      if (!allQueries.includes(v)) allQueries.push(v);
    }
    const queries = allQueries.slice(0, MAX_QUERIES_PER_BOOK);

    const links: SearchResult[] = [];
    const seenUrls = new Set<string>();

    let error: string | undefined;
    for (let i = 0; i < queries.length; i++) {
      try {
        const results = await searchBrave(queries[i], apiKey);
        for (const r of results) {
          const key = r.url.toLowerCase();
          if (!seenUrls.has(key)) {
            seenUrls.add(key);
            links.push(r);
          }
        }
        await new Promise((r) => setTimeout(r, 400)); // rate limit
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    report.push({
      book: book.name,
      author: book.author,
      queries: queries.length,
      links,
      error,
    });

    console.log(
      `[${report.length}/${books.length}] ${book.name} (${book.author}): ${links.length} links${error ? ` [ERROR: ${error}]` : ""}`
    );
  }

  // Save to reference/found-books
  const outDir = join(process.cwd(), "reference", "found-books");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        books: report.map((r) => ({
          book: r.book,
          author: r.author,
          queries: r.queries,
          linkCount: r.links.length,
          error: r.error ?? null,
          links: r.links,
        })),
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nSaved to ${outPath}`);

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("RAG TEXT SOURCE SEARCH REPORT");
  console.log("=".repeat(80));

  const found = report.filter((r) => r.links.length > 0 && !r.error);
  const failed = report.filter((r) => r.error);
  const empty = report.filter((r) => r.links.length === 0 && !r.error);

  console.log(`\nFOUND (${found.length} books with TEXT links):`);
  for (const r of found) {
    console.log(`  - ${r.author}: ${r.book}`);
    const top = r.links.slice(0, 3);
    for (const l of top) {
      console.log(`      ${l.url}`);
    }
    if (r.links.length > 3) {
      console.log(`      ... and ${r.links.length - 3} more`);
    }
  }

  if (empty.length > 0) {
    console.log(`\nNO LINKS (${empty.length} books, ${empty.reduce((s, r) => s + r.queries, 0)} queries total):`);
    for (const r of empty) {
      console.log(`  - ${r.author}: ${r.book} (${r.queries} queries)`);
    }
  }

  if (failed.length > 0) {
    console.log(`\nERRORS (${failed.length} books):`);
    for (const r of failed) {
      console.log(`  - ${r.author}: ${r.book} - ${r.error}`);
    }
  }

  console.log("\n" + "=".repeat(80));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
