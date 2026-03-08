#!/usr/bin/env tsx
/**
 * Downloads the actual TEXT content of books from reference/found-books/results.json
 * and saves them as .txt files in reference/found-books/.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type SearchLink = { url: string; title: string; description: string };
type BookResult = {
  book: string;
  author: string;
  links: SearchLink[];
};

function slugify(author: string, book: string): string {
  return `${author}-${book}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractGutenbergId(url: string): string | null {
  const m = url.match(/gutenberg\.org\/(?:ebooks|files|cache\/epub)\/(\d+)/i);
  return m ? m[1] : null;
}

function getGutenbergTxtUrl(url: string): string | null {
  const id = extractGutenbergId(url);
  if (!id) return null;
  return `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
}

function isArchiveTxtStream(url: string): boolean {
  return /archive\.org\/stream\/.+(?:_djvu\.txt|\.txt)(?:\?|$)/i.test(url) || url.includes("/stream/") && url.endsWith(".txt");
}

function getArchiveTxtFromDetails(url: string): string | null {
  const m = url.match(/archive\.org\/details\/([^/?#]+)/i);
  if (!m) return null;
  const id = m[1];
  return `https://archive.org/stream/${id}/${id}_djvu.txt`;
}

async function fetchText(url: string): Promise<{ text: string; ok: boolean }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; StoicsRAG/1.0; +https://github.com)",
      Accept: "text/plain,text/html;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) return { text: "", ok: false };
  const text = await res.text();
  return { text, ok: true };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextFromHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : html;
  return stripHtml(content);
}

async function tryDownloadUrl(url: string): Promise<string | null> {
  try {
    const { text, ok } = await fetchText(url);
    if (!ok || !text || text.length < 500) return null;
    if (text.trimStart().startsWith("<html") || text.trimStart().startsWith("<!DOCTYPE")) {
      return extractTextFromHtml(text);
    }
    return text;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const resultsPath = join(process.cwd(), "reference", "found-books", "results.json");
  const raw = readFileSync(resultsPath, "utf8");
  const data = JSON.parse(raw) as { books: BookResult[] };

  const outDir = join(process.cwd(), "reference", "found-books");
  mkdirSync(outDir, { recursive: true });

  const report: Array<{ book: string; author: string; status: string; source?: string }> = [];

  for (const entry of data.books) {
    const slug = slugify(entry.author, entry.book);
    const outPath = join(outDir, `${slug}.txt`);

    const candidates: string[] = [];
    for (const link of entry.links) {
      const u = link.url;
      if (u.includes("archive.org/stream") && (u.includes(".txt") || u.includes("_djvu.txt"))) {
        if (!candidates.includes(u)) candidates.push(u);
      }
    }
    for (const link of entry.links) {
      const u = link.url;
      if (u.includes("gutenberg.org")) {
        const txt = getGutenbergTxtUrl(u);
        if (txt && !candidates.includes(txt)) candidates.push(txt);
      }
    }
    for (const link of entry.links) {
      const u = link.url;
      if (u.includes("archive.org/details")) {
        const txt = getArchiveTxtFromDetails(u);
        if (txt && !candidates.includes(txt)) candidates.push(txt);
      }
    }
    for (const link of entry.links) {
      const u = link.url;
      if (
        (u.includes("gutenberg.org") || u.includes("perseus.tufts.edu")) &&
        !candidates.includes(u)
      ) {
        candidates.push(u);
      }
    }

    let content: string | null = null;
    let usedUrl = "";

    for (const url of candidates.slice(0, 5)) {
      content = await tryDownloadUrl(url);
      if (content && content.length >= 1000) {
        usedUrl = url;
        break;
      }
      await sleep(600);
    }

    if (content && content.length >= 1000) {
      const header = `Title: ${entry.book}\nAuthor: ${entry.author}\nSource: ${usedUrl}\n\n`;
      writeFileSync(outPath, header + content, "utf8");
      report.push({
        book: entry.book,
        author: entry.author,
        status: "OK",
        source: usedUrl,
      });
      console.log(`[OK] ${entry.author}: ${entry.book} -> ${slug}.txt`);
    } else {
      report.push({
        book: entry.book,
        author: entry.author,
        status: "FAILED",
      });
      console.log(`[FAIL] ${entry.author}: ${entry.book} (no usable text)`);
    }

    await sleep(800);
  }

  const ok = report.filter((r) => r.status === "OK").length;
  const fail = report.filter((r) => r.status === "FAILED").length;
  console.log(`\nDone: ${ok} downloaded, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
