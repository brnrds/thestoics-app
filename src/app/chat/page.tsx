"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ActiveModeRecord, MessageRecord, ThreadRecord } from "@/lib/contracts";
import { ThreadChatPanel } from "@/components/chat/ThreadChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

type ThreadDetailResponse = {
  thread: ThreadRecord;
  messages: MessageRecord[];
};

function sortThreads(threads: ThreadRecord[]): ThreadRecord[] {
  return [...threads].sort(
    (a, b) =>
      new Date(b.latestActivityAt).getTime() -
      new Date(a.latestActivityAt).getTime()
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ChatWorkspacePage() {
  const [modes, setModes] = useState<ActiveModeRecord[]>([]);
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadRecord | null>(null);
  const [activeMessages, setActiveMessages] = useState<MessageRecord[]>([]);
  const [newModeId, setNewModeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredThreads = useMemo(() => {
    if (!threadSearch.trim()) return threads;
    const query = threadSearch.toLowerCase();
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.modeSnapshot.modeName.toLowerCase().includes(query)
    );
  }, [threads, threadSearch]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const defaultMode = useMemo(
    () => modes.find((mode) => mode.isDefault) ?? modes[0] ?? null,
    [modes]
  );

  const loadModes = useCallback(async () => {
    const response = await fetch("/api/modes/active", { cache: "no-store" });
    const data = (await response.json()) as {
      modes?: ActiveModeRecord[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "Failed to load modes.");
    const modeList = data.modes || [];
    setModes(modeList);
    setNewModeId(
      (current) =>
        current ||
        modeList.find((mode) => mode.isDefault)?.id ||
        modeList[0]?.id ||
        ""
    );
  }, []);

  const loadThreads = useCallback(async () => {
    const response = await fetch("/api/threads", { cache: "no-store" });
    const data = (await response.json()) as {
      threads?: ThreadRecord[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "Failed to load threads.");
    const nextThreads = sortThreads(data.threads || []);
    setThreads(nextThreads);
    return nextThreads;
  }, []);

  const loadThreadDetail = useCallback(async (threadId: string) => {
    setLoadingThread(true);
    const response = await fetch(`/api/threads/${threadId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as ThreadDetailResponse & {
      error?: string;
    };
    setLoadingThread(false);
    if (!response.ok)
      throw new Error(data.error || "Failed to load thread details.");
    setActiveThread(data.thread);
    setActiveMessages(data.messages || []);
    return data;
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadModes();
      const loadedThreads = await loadThreads();
      if (loadedThreads[0]) await loadThreadDetail(loadedThreads[0].id);
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "Failed to initialize workspace."
      );
    } finally {
      setLoading(false);
    }
  }, [loadModes, loadThreads, loadThreadDetail]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
      if (mod && e.key === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const activeThreadId = activeThread?.id ?? null;

  const refreshActiveThread = useCallback(async () => {
    if (!activeThreadId) return;
    const [updatedThreads] = await Promise.all([
      loadThreads(),
      loadThreadDetail(activeThreadId),
    ]);
    if (!updatedThreads.some((thread) => thread.id === activeThreadId)) {
      const next = updatedThreads[0] ?? null;
      setActiveThread(next);
      if (next) await loadThreadDetail(next.id);
      else setActiveMessages([]);
    }
  }, [activeThreadId, loadThreadDetail, loadThreads]);

  const createThread = async () => {
    setError(null);
    const body: Record<string, string> = {};
    if (newModeId) body.modeId = newModeId;
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as {
      thread?: ThreadRecord;
      error?: string;
    } | null;
    if (!response.ok || !data?.thread) {
      setError(data?.error || "Failed to create thread.");
      return;
    }
    await loadThreads();
    await loadThreadDetail(data.thread.id);
  };

  const startRename = (thread: ThreadRecord) => {
    setRenamingThreadId(thread.id);
    setRenameValue(thread.title);
  };

  const submitRename = async (threadId: string) => {
    const title = renameValue.trim();
    setRenamingThreadId(null);
    if (!title) return;
    const response = await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Failed to rename thread.");
      return;
    }
    await loadThreads();
    if (activeThread?.id === threadId) await loadThreadDetail(threadId);
  };

  const confirmAndDeleteThread = async (threadId: string) => {
    setConfirmDeleteId(null);
    const response = await fetch(`/api/threads/${threadId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Failed to delete thread.");
      return;
    }
    const updatedThreads = await loadThreads();
    if (activeThread?.id === threadId) {
      const next = updatedThreads[0] ?? null;
      setActiveThread(next);
      if (next) await loadThreadDetail(next.id);
      else setActiveMessages([]);
    }
  };

  const chooseThread = async (threadId: string) => {
    if (activeThread?.id === threadId) return;
    try {
      await loadThreadDetail(threadId);
    } catch (threadError) {
      setError(
        threadError instanceof Error
          ? threadError.message
          : "Failed to load thread."
      );
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm font-sans text-ink-tertiary">
          Loading workspace…
        </p>
      </div>
    );
  }

  const startFromSuggestion = async (text: string) => {
    setError(null);
    setPendingFirstMessage(text);
    const body: Record<string, string> = { title: text.slice(0, 60) };
    if (newModeId) body.modeId = newModeId;
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as {
      thread?: ThreadRecord;
      error?: string;
    } | null;
    if (!response.ok || !data?.thread) {
      setPendingFirstMessage(null);
      setError(data?.error || "Failed to create thread.");
      return;
    }
    await loadThreads();
    await loadThreadDetail(data.thread.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const chooseThreadAndCloseMobile = async (threadId: string) => {
    await chooseThread(threadId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  return (
    <div className="flex h-dvh">
      {/* ── Mobile overlay backdrop ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-ink/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[280px] flex-col border-r border-rule bg-surface transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:transition-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${!sidebarOpen ? "md:hidden" : ""}`}
      >
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl tracking-normal">Confer with the Stoics</h1>
            <button
              className="rounded p-1 text-ink-tertiary transition-colors hover:bg-surface-alt hover:text-ink-secondary"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M12 3L6 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="flex-1 rounded-md bg-ink px-3 py-2 font-sans text-sm font-medium text-canvas transition-opacity hover:opacity-85 disabled:opacity-30"
              onClick={createThread}
              disabled={!modes.length}
            >
              New Thread
            </button>
            {modes.length > 1 && (
              <select
                className="input-base min-w-0 flex-1 py-2 text-xs"
                value={newModeId}
                onChange={(e) => setNewModeId(e.target.value)}
                title="Interaction mode for new threads"
              >
                {modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!modes.length && (
            <p className="mt-1.5 font-sans text-xs text-ink-tertiary">
              No active modes.{" "}
              <Link href="/admin/modes" className="underline">
                Configure
              </Link>
            </p>
          )}
          {error && (
            <p className="mt-1.5 font-sans text-xs text-danger">{error}</p>
          )}
        </div>

        {threads.length > 0 && (
          <div className="px-4 pb-2">
            <input
              ref={searchInputRef}
              className="input-base w-full py-1.5 text-xs"
              placeholder="Search threads… (⌘K)"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {threads.length === 0 && (
            <p className="px-3 py-2 font-sans text-sm text-ink-tertiary">
              No threads yet.
            </p>
          )}
          {filteredThreads.length === 0 && threads.length > 0 && (
            <p className="px-3 py-2 font-sans text-sm text-ink-tertiary">
              No matching threads.
            </p>
          )}
          {filteredThreads.map((thread) => {
            const isActive = activeThread?.id === thread.id;
            const isRenaming = renamingThreadId === thread.id;
            const isConfirmingDelete = confirmDeleteId === thread.id;

            if (isConfirmingDelete) {
              return (
                <div key={thread.id} className="rounded-md border border-danger/30 bg-danger-wash px-3 py-2.5">
                  <p className="font-sans text-xs text-ink-secondary">
                    Delete &ldquo;{thread.title}&rdquo;?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded bg-danger px-2.5 py-1 font-sans text-[11px] font-medium text-canvas transition-opacity hover:opacity-85"
                      onClick={() => confirmAndDeleteThread(thread.id)}
                    >
                      Delete
                    </button>
                    <button
                      className="rounded px-2.5 py-1 font-sans text-[11px] text-ink-secondary transition-colors hover:text-ink"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={thread.id} className="group relative">
                {isRenaming ? (
                  <form
                    className="px-3 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitRename(thread.id);
                    }}
                  >
                    <input
                      className="input-base w-full py-1 text-sm"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void submitRename(thread.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenamingThreadId(null);
                      }}
                      autoFocus
                    />
                  </form>
                ) : (
                  <button
                    className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? "bg-accent-wash text-accent"
                        : "text-ink hover:bg-surface-alt"
                    }`}
                    onClick={() => chooseThreadAndCloseMobile(thread.id)}
                  >
                    <p
                      className={`font-sans text-sm ${isActive ? "font-medium" : ""}`}
                    >
                      {thread.title}
                    </p>
                    <p className="mt-0.5 font-sans text-xs text-ink-tertiary">
                      {thread.modeSnapshot.modeName} ·{" "}
                      {relativeTime(thread.latestActivityAt)}
                    </p>
                  </button>
                )}
                {!isRenaming && (
                  <div className="absolute top-2 right-2 hidden gap-1 group-hover:flex">
                    <button
                      className="rounded px-1.5 py-0.5 font-sans text-[11px] text-ink-tertiary transition-colors hover:bg-surface hover:text-ink-secondary"
                      onClick={() => startRename(thread)}
                    >
                      Rename
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 font-sans text-[11px] text-danger transition-colors hover:bg-danger-wash"
                      onClick={() => setConfirmDeleteId(thread.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-rule px-4 py-3">
          <Link
            href="/admin"
            className="font-sans text-xs text-ink-tertiary transition-colors hover:text-ink-secondary"
          >
            Admin Console
          </Link>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute top-4 left-4 right-6 z-10 flex items-center justify-between">
          {!sidebarOpen && (
            <button
              className="rounded p-1.5 text-ink-tertiary transition-colors hover:bg-surface-alt hover:text-ink-secondary"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        {!activeThread ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-lg px-6 text-center">
              <p className="text-2xl leading-relaxed text-ink-secondary italic">
                &ldquo;The happiness of your life depends upon the quality of
                your thoughts.&rdquo;
              </p>
              <p className="mt-4 font-sans text-sm text-ink-tertiary">
                Marcus Aurelius · Meditations IV.3
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-2">
                {[
                  "How do I stop worrying about things I can't control?",
                  "What did Epictetus teach about freedom?",
                  "Help me think through a difficult decision",
                  "What is the Stoic view on anger?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border border-rule px-4 py-2 font-sans text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                    onClick={() => startFromSuggestion(suggestion)}
                    disabled={!modes.length}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : loadingThread ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-sans text-sm text-ink-tertiary">
              Loading thread…
            </p>
          </div>
        ) : (
          <ThreadChatPanel
            key={activeThread.id}
            thread={activeThread}
            persistedMessages={activeMessages}
            onPersistedRefresh={refreshActiveThread}
            initialInput={pendingFirstMessage}
            onInitialInputConsumed={() => setPendingFirstMessage(null)}
          />
        )}
      </main>
    </div>
  );
}
