import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const rawBookSchema = z.object({
  author: z.string().trim().min(1),
  name: z.string().trim().min(1),
  "website-suggested": z.string().trim().min(1).optional(),
});

const rawCatalogSchema = z.object({
  websites: z.array(z.string().trim().min(1)).default([]),
  books: z.array(rawBookSchema).default([]),
});

export type RagSourceBook = {
  id: string;
  author: string;
  name: string;
  websiteSuggested: string | null;
};

export type RagSourceCatalog = {
  websites: string[];
  books: RagSourceBook[];
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function buildBookId(author: string, name: string, index: number): string {
  const slug = `${author}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${String(index + 1).padStart(2, "0")}-${slug}` : `book-${index + 1}`;
}

export async function loadRagSourceCatalog(): Promise<RagSourceCatalog> {
  const catalogPath = path.join(process.cwd(), "reference", "books.json");
  const raw = await fs.readFile(catalogPath, "utf8");
  const parsed = rawCatalogSchema.parse(JSON.parse(raw));

  const websites = Array.from(
    new Set(parsed.websites.map(normalizeDomain).filter((value) => value.length > 0))
  );

  const books = parsed.books.map((book, index) => {
    const websiteSuggested = book["website-suggested"]
      ? normalizeDomain(book["website-suggested"])
      : null;

    return {
      id: buildBookId(book.author, book.name, index),
      author: book.author.trim(),
      name: book.name.trim(),
      websiteSuggested,
    } satisfies RagSourceBook;
  });

  return { websites, books };
}
