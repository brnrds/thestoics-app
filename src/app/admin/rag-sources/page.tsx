"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RagSourceBook = {
  id: string;
  author: string;
  name: string;
  websiteSuggested: string | null;
};

type RagSourceCatalogResponse = {
  websites: string[];
  books: RagSourceBook[];
  error?: string;
};

type SearchLink = {
  url: string;
  title: string;
  description: string;
};

type SearchResponse = {
  results?: SearchLink[];
  error?: string;
  details?: string;
};

type CollectedLink = SearchLink & {
  query: string;
  domain: string | null;
};

type StepStatus = "running" | "done" | "error";

type SearchStep = {
  id: string;
  label: string;
  query: string;
  domain: string | null;
  status: StepStatus;
  resultCount: number;
  error: string | null;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function buildDomainPlan(
  websiteSuggested: string | null,
  websites: string[]
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const addDomain = (value: string | null) => {
    if (!value) {
      return;
    }
    const normalized = normalizeDomain(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  };

  addDomain(websiteSuggested);
  websites.forEach((domain) => addDomain(domain));

  return ordered;
}

function buildSiteQuery(book: RagSourceBook, domain: string): string {
  return `"${book.name}" "${book.author}" text site:${domain}`;
}

function buildFallbackQuery(book: RagSourceBook): string {
  return `"${book.name}" "${book.author}" text online`;
}

function dedupeLinks(existing: CollectedLink[], next: CollectedLink[]): CollectedLink[] {
  const byUrl = new Map<string, CollectedLink>();

  [...existing, ...next].forEach((link) => {
    byUrl.set(link.url.toLowerCase(), link);
  });

  return Array.from(byUrl.values());
}

function statusBadgeClass(status: StepStatus): string {
  if (status === "running") {
    return "bg-accent-wash text-accent";
  }
  if (status === "error") {
    return "bg-danger-wash text-danger";
  }
  return "bg-surface-alt text-ink-secondary";
}

async function executeSearchQuery(
  query: string
): Promise<{ links: SearchLink[]; error: string | null }> {
  const response = await fetch("/api/admin/rag-sources/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, count: 8 }),
  });

  const payload = (await response.json().catch(() => null)) as SearchResponse | null;
  if (!response.ok) {
    const message = payload?.error || "Search request failed.";
    const details = payload?.details ? ` ${payload.details}` : "";
    return { links: [], error: `${message}${details}`.trim() };
  }

  return { links: payload?.results ?? [], error: null };
}

export default function AdminRagSourcesPage() {
  const [websites, setWebsites] = useState<string[]>([]);
  const [books, setBooks] = useState<RagSourceBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [steps, setSteps] = useState<SearchStep[]>([]);
  const [links, setLinks] = useState<CollectedLink[]>([]);

  const runTokenRef = useRef(0);

  useEffect(() => {
    const loadCatalog = async () => {
      setLoading(true);
      setCatalogError(null);

      const response = await fetch("/api/admin/rag-sources/books", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | RagSourceCatalogResponse
        | null;

      if (!response.ok) {
        setCatalogError(payload?.error || "Failed to load catalog.");
        setLoading(false);
        return;
      }

      setWebsites(payload?.websites ?? []);
      setBooks(payload?.books ?? []);
      setSelectedBookId((current) => current ?? payload?.books?.[0]?.id ?? null);
      setLoading(false);
    };

    void loadCatalog();
  }, []);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  const domainPlan = useMemo(
    () =>
      selectedBook ? buildDomainPlan(selectedBook.websiteSuggested, websites) : [],
    [selectedBook, websites]
  );

  const clearRunData = () => {
    setRunError(null);
    setSteps([]);
    setLinks([]);
  };

  const startRun = async () => {
    if (!selectedBook || running) {
      return;
    }

    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;

    setRunning(true);
    clearRunData();

    let anyDomainReturnedLinks = false;

    const updateStep = (id: string, patch: Partial<SearchStep>) => {
      setSteps((current) =>
        current.map((step) => (step.id === id ? { ...step, ...patch } : step))
      );
    };

    try {
      for (const domain of domainPlan) {
        if (runTokenRef.current !== runToken) {
          return;
        }

        const query = buildSiteQuery(selectedBook, domain);
        const stepId = `${runToken}-${domain}`;

        setSteps((current) => [
          ...current,
          {
            id: stepId,
            label: `Search ${domain}`,
            query,
            domain,
            status: "running",
            resultCount: 0,
            error: null,
          },
        ]);

        const result = await executeSearchQuery(query);
        if (result.error) {
          updateStep(stepId, {
            status: "error",
            error: result.error,
          });
          continue;
        }

        if (result.links.length > 0) {
          anyDomainReturnedLinks = true;
        }

        setLinks((current) =>
          dedupeLinks(
            current,
            result.links.map((link) => ({
              ...link,
              query,
              domain,
            }))
          )
        );

        updateStep(stepId, {
          status: "done",
          resultCount: result.links.length,
        });
      }

      if (!anyDomainReturnedLinks) {
        const fallbackQuery = buildFallbackQuery(selectedBook);
        const fallbackStepId = `${runToken}-fallback`;

        setSteps((current) => [
          ...current,
          {
            id: fallbackStepId,
            label: "Fallback broad search",
            query: fallbackQuery,
            domain: null,
            status: "running",
            resultCount: 0,
            error: null,
          },
        ]);

        const fallbackResult = await executeSearchQuery(fallbackQuery);
        if (fallbackResult.error) {
          updateStep(fallbackStepId, {
            status: "error",
            error: fallbackResult.error,
          });
        } else {
          setLinks((current) =>
            dedupeLinks(
              current,
              fallbackResult.links.map((link) => ({
                ...link,
                query: fallbackQuery,
                domain: null,
              }))
            )
          );

          updateStep(fallbackStepId, {
            status: "done",
            resultCount: fallbackResult.links.length,
          });
        }
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Unexpected run error.");
    } finally {
      if (runTokenRef.current === runToken) {
        setRunning(false);
      }
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">RAG Text Finder</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Human-triggered source discovery for each book. This tool only gathers
          links and never downloads content.
        </p>

        <div className="mt-4 grid gap-3 rounded-md border border-rule-light bg-surface-alt/40 p-3 font-sans text-xs text-ink-secondary">
          <p>
            <span className="text-ink-tertiary">Known websites:</span>{" "}
            {websites.length}
          </p>
          <p>
            <span className="text-ink-tertiary">Book list:</span> {books.length}
          </p>
        </div>

        {catalogError && (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger-wash p-3 font-sans text-sm text-danger">
            {catalogError}
          </p>
        )}

        <div className="mt-4 space-y-2">
          <p className="label-meta">Select Book</p>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {loading && (
              <p className="font-sans text-sm text-ink-tertiary">
                Loading source catalog…
              </p>
            )}
            {!loading && books.length === 0 && (
              <p className="font-sans text-sm text-ink-tertiary">
                No books configured.
              </p>
            )}
            {books.map((book) => {
              const selected = book.id === selectedBookId;
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => {
                    if (running) {
                      return;
                    }
                    setSelectedBookId(book.id);
                    clearRunData();
                  }}
                  className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                    selected
                      ? "border-accent bg-accent-wash/70"
                      : "border-rule-light hover:bg-surface-alt"
                  }`}
                >
                  <p className="font-sans text-sm font-medium text-ink">
                    {book.name}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-ink-secondary">
                    {book.author}
                  </p>
                  <p className="mt-1 font-sans text-[11px] text-ink-tertiary">
                    Suggested first: {book.websiteSuggested ?? "None"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Run Monitor</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Orchestrate one run at a time and inspect each search query before using
          the links for ingestion.
        </p>

        {!selectedBook && (
          <p className="mt-5 font-sans text-sm text-ink-tertiary">
            Select a book to start a search run.
          </p>
        )}

        {selectedBook && (
          <>
            <div className="mt-5 rounded-md border border-rule-light bg-surface-alt/40 p-4">
              <p className="label-meta">Selected Book</p>
              <h3 className="mt-1 text-xl">{selectedBook.name}</h3>
              <p className="mt-0.5 font-sans text-sm text-ink-secondary">
                {selectedBook.author}
              </p>
              <p className="mt-2 font-sans text-xs text-ink-tertiary">
                Search order:{" "}
                {domainPlan.length > 0 ? domainPlan.join(" -> ") : "No domains"}{" "}
                {"->"} fallback query only if all domain searches return zero links.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 font-sans text-sm">
              <button
                type="button"
                onClick={() => void startRun()}
                disabled={running || loading}
                className="rounded-md bg-ink px-4 py-2 text-canvas transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {running ? "Searching…" : "Run Selected Book"}
              </button>
              <button
                type="button"
                onClick={clearRunData}
                disabled={running}
                className="rounded-md border border-rule px-4 py-2 text-ink-secondary transition-colors hover:bg-surface-alt disabled:opacity-40"
              >
                Clear Run Data
              </button>
            </div>

            {runError && (
              <p className="mt-4 rounded-md border border-danger/30 bg-danger-wash p-3 font-sans text-sm text-danger">
                {runError}
              </p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-rule-light p-3">
                <p className="label-meta">Queries Executed</p>
                <p className="mt-1 font-sans text-3xl font-light tracking-tight">
                  {steps.length}
                </p>
              </div>
              <div className="rounded-md border border-rule-light p-3">
                <p className="label-meta">Unique Links Found</p>
                <p className="mt-1 font-sans text-3xl font-light tracking-tight">
                  {links.length}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="font-sans text-sm font-medium">Activity</h3>
              <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                {steps.length === 0 && (
                  <p className="font-sans text-sm text-ink-tertiary">
                    No queries executed yet.
                  </p>
                )}
                {steps.map((step) => (
                  <article
                    key={step.id}
                    className="rounded-md border border-rule-light bg-surface-alt/30 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-sans text-sm font-medium text-ink">
                        {step.label}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 font-sans text-[11px] ${statusBadgeClass(step.status)}`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-1 font-sans text-xs text-ink-secondary">
                      {step.query}
                    </p>
                    <p className="mt-1 font-sans text-xs text-ink-tertiary">
                      {step.resultCount} links returned
                    </p>
                    {step.error && (
                      <p className="mt-1 font-sans text-xs text-danger">
                        {step.error}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="font-sans text-sm font-medium">Collected Links</h3>
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                {links.length === 0 && (
                  <p className="font-sans text-sm text-ink-tertiary">
                    No links collected yet.
                  </p>
                )}
                {links.map((link) => (
                  <article
                    key={link.url}
                    className="rounded-md border border-rule-light p-3"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-sans text-sm text-accent hover:underline"
                    >
                      {link.url}
                    </a>
                    {link.title && (
                      <p className="mt-1 font-sans text-xs text-ink-secondary">
                        {link.title}
                      </p>
                    )}
                    <p className="mt-1 font-sans text-[11px] text-ink-tertiary">
                      Source query: {link.query}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
