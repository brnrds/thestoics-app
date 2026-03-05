"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [newTitle, setNewTitle] = useState("New Reflection");
  const [newModeId, setNewModeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!newModeId) {
      setError("Select an active interaction mode.");
      return;
    }
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim() || "New Reflection",
        modeId: newModeId,
      }),
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
    setNewTitle("New Reflection");
  };

  const renameThread = async (thread: ThreadRecord) => {
    const title = window.prompt("Rename thread", thread.title)?.trim();
    if (!title) return;
    const response = await fetch(`/api/threads/${thread.id}`, {
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
    if (activeThread?.id === thread.id) await loadThreadDetail(thread.id);
  };

  const deleteThread = async (thread: ThreadRecord) => {
    if (!window.confirm("Delete this thread and all its messages?")) return;
    const response = await fetch(`/api/threads/${thread.id}`, {
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
    if (activeThread?.id === thread.id) {
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

  return (
    <div className="flex h-dvh">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-rule">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-xl tracking-normal">Confer with the Stoics</h1>
          <Link
            href="/admin"
            className="mt-1 inline-block font-sans text-xs text-ink-tertiary transition-colors hover:text-ink-secondary"
          >
            Admin Console
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {threads.length === 0 && (
            <p className="px-3 py-2 font-sans text-sm text-ink-tertiary">
              No threads yet.
            </p>
          )}
          {threads.map((thread) => {
            const isActive = activeThread?.id === thread.id;
            return (
              <div key={thread.id} className="group relative">
                <button
                  className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "bg-accent-wash text-accent"
                      : "text-ink hover:bg-surface-alt"
                  }`}
                  onClick={() => chooseThread(thread.id)}
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
                <div className="absolute top-2 right-2 hidden gap-1 group-hover:flex">
                  <button
                    className="rounded px-1.5 py-0.5 font-sans text-[11px] text-ink-tertiary transition-colors hover:bg-surface hover:text-ink-secondary"
                    onClick={() => renameThread(thread)}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded px-1.5 py-0.5 font-sans text-[11px] text-danger transition-colors hover:bg-danger-wash"
                    onClick={() => deleteThread(thread)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* New thread */}
        <div className="space-y-2 border-t border-rule p-4">
          <p className="label-meta">New Thread</p>
          <input
            className="input-base w-full"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Thread title"
          />
          <select
            className="input-base w-full"
            value={newModeId}
            onChange={(e) => setNewModeId(e.target.value)}
          >
            {modes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
                {mode.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <button
            className="w-full rounded-md bg-ink px-3 py-2 font-sans text-sm font-medium text-canvas transition-opacity hover:opacity-85 disabled:opacity-30"
            onClick={createThread}
            disabled={!modes.length}
          >
            Create
          </button>
          {!modes.length && (
            <p className="font-sans text-xs text-ink-tertiary">
              No active modes.{" "}
              <Link href="/admin/modes" className="underline">
                Configure
              </Link>
            </p>
          )}
          {defaultMode && (
            <p className="font-sans text-xs text-ink-tertiary">
              Default: {defaultMode.name}
            </p>
          )}
        </div>

        {error && (
          <p className="px-4 pb-3 font-sans text-xs text-danger">{error}</p>
        )}
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute top-4 right-6 z-10">
          <ThemeToggle />
        </div>
        {!activeThread ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md px-6 text-center">
              <p className="text-2xl leading-relaxed text-ink-secondary italic">
                &ldquo;The happiness of your life depends upon the quality of
                your thoughts.&rdquo;
              </p>
              <p className="mt-4 font-sans text-sm text-ink-tertiary">
                Marcus Aurelius · Meditations IV.3
              </p>
              <p className="mt-10 font-sans text-sm text-ink-secondary">
                Create a thread to begin.
              </p>
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
          />
        )}
      </main>
    </div>
  );
}
