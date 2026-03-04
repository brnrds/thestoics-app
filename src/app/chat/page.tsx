"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ActiveModeRecord, MessageRecord, ThreadRecord } from "@/lib/contracts";
import { ThreadChatPanel } from "@/components/chat/ThreadChatPanel";

type ThreadDetailResponse = {
  thread: ThreadRecord;
  messages: MessageRecord[];
};

function sortThreads(threads: ThreadRecord[]): ThreadRecord[] {
  return [...threads].sort((a, b) =>
    new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime()
  );
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
    const data = (await response.json()) as { modes?: ActiveModeRecord[]; error?: string };

    if (!response.ok) {
      throw new Error(data.error || "Failed to load modes.");
    }

    const modeList = data.modes || [];
    setModes(modeList);
    setNewModeId((current) => current || modeList.find((mode) => mode.isDefault)?.id || modeList[0]?.id || "");
  }, []);

  const loadThreads = useCallback(async () => {
    const response = await fetch("/api/threads", { cache: "no-store" });
    const data = (await response.json()) as { threads?: ThreadRecord[]; error?: string };

    if (!response.ok) {
      throw new Error(data.error || "Failed to load threads.");
    }

    const nextThreads = sortThreads(data.threads || []);
    setThreads(nextThreads);

    return nextThreads;
  }, []);

  const loadThreadDetail = useCallback(async (threadId: string) => {
    setLoadingThread(true);

    const response = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
    const data = (await response.json()) as ThreadDetailResponse & { error?: string };

    setLoadingThread(false);

    if (!response.ok) {
      throw new Error(data.error || "Failed to load thread details.");
    }

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
      if (loadedThreads[0]) {
        await loadThreadDetail(loadedThreads[0].id);
      }
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to initialize workspace.");
    } finally {
      setLoading(false);
    }
  }, [loadModes, loadThreads, loadThreadDetail]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refreshActiveThread = useCallback(async () => {
    if (!activeThread) {
      return;
    }

    const [updatedThreads] = await Promise.all([loadThreads(), loadThreadDetail(activeThread.id)]);
    if (!updatedThreads.some((thread) => thread.id === activeThread.id)) {
      const next = updatedThreads[0] ?? null;
      setActiveThread(next);
      if (next) {
        await loadThreadDetail(next.id);
      } else {
        setActiveMessages([]);
      }
    }
  }, [activeThread, loadThreadDetail, loadThreads]);

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

    const data = (await response.json().catch(() => null)) as { thread?: ThreadRecord; error?: string } | null;

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
    if (!title) {
      return;
    }

    const response = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Failed to rename thread.");
      return;
    }

    await loadThreads();
    if (activeThread?.id === thread.id) {
      await loadThreadDetail(thread.id);
    }
  };

  const deleteThread = async (thread: ThreadRecord) => {
    if (!window.confirm("Delete this thread and all its messages?")) {
      return;
    }

    const response = await fetch(`/api/threads/${thread.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Failed to delete thread.");
      return;
    }

    const updatedThreads = await loadThreads();

    if (activeThread?.id === thread.id) {
      const next = updatedThreads[0] ?? null;
      setActiveThread(next);
      if (next) {
        await loadThreadDetail(next.id);
      } else {
        setActiveMessages([]);
      }
    }
  };

  const chooseThread = async (threadId: string) => {
    if (activeThread?.id === threadId) {
      return;
    }

    try {
      await loadThreadDetail(threadId);
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : "Failed to load thread.");
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-7xl p-8 text-sm">Loading chat workspace...</div>;
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[300px_1fr]">
      <aside className="card-surface flex h-[78vh] flex-col p-4">
        <div className="mb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-clay-700)]">Confer with the Stoics</p>
          <h1 className="text-2xl font-semibold">Chat Threads</h1>
          <div className="mt-2 flex gap-2 text-xs">
            <Link href="/admin" className="rounded-full border border-[var(--color-clay-700)]/40 px-3 py-1 hover:bg-[var(--color-sand-100)]">
              Admin
            </Link>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--color-clay-700)]/22 bg-white/70 p-3">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-clay-700)]">New Thread</p>
          <input
            className="input-base w-full text-sm"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Thread title"
          />
          <select
            className="input-base w-full text-sm"
            value={newModeId}
            onChange={(event) => setNewModeId(event.target.value)}
          >
            {modes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name} {mode.isDefault ? "(default)" : ""}
              </option>
            ))}
          </select>
          <button
            className="w-full rounded-full bg-[var(--color-olive-500)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={createThread}
            disabled={!modes.length}
          >
            Create Thread
          </button>
          {!modes.length ? (
            <p className="text-xs text-[var(--color-clay-700)]">No active modes. Activate one in admin.</p>
          ) : null}
          {defaultMode ? (
            <p className="text-xs text-[var(--color-clay-700)]">Default mode: {defaultMode.name}</p>
          ) : null}
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
          {threads.length === 0 ? (
            <p className="text-sm text-[var(--color-clay-700)]">No threads yet.</p>
          ) : null}
          {threads.map((thread) => (
            <article
              key={thread.id}
              className={`rounded-xl border p-3 text-sm ${
                activeThread?.id === thread.id
                  ? "border-[var(--color-olive-500)] bg-[var(--color-sand-100)]/75"
                  : "border-[var(--color-clay-700)]/24 bg-white/70"
              }`}
            >
              <button className="w-full text-left" onClick={() => chooseThread(thread.id)}>
                <p className="font-medium">{thread.title}</p>
                <p className="mt-1 text-xs text-[var(--color-clay-700)]">{thread.modeSnapshot.modeName}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-clay-700)]">
                  {new Date(thread.latestActivityAt).toLocaleString()}
                </p>
              </button>
              <div className="mt-2 flex gap-2 text-[11px]">
                <button className="rounded-full border px-2 py-1" onClick={() => renameThread(thread)}>
                  Rename
                </button>
                <button
                  className="rounded-full border border-red-700 px-2 py-1 text-red-700"
                  onClick={() => deleteThread(thread)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>

        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </aside>

      <div>
        {!activeThread ? (
          <section className="card-surface flex h-[78vh] items-center justify-center p-6 text-center">
            <div>
              <h2 className="text-3xl font-semibold">Start a Stoic Conversation</h2>
              <p className="mt-2 text-sm text-[var(--color-clay-700)]">
                Create a thread and choose an active interaction mode to begin.
              </p>
            </div>
          </section>
        ) : loadingThread ? (
          <section className="card-surface flex h-[78vh] items-center justify-center p-6 text-sm">
            Loading thread...
          </section>
        ) : (
          <ThreadChatPanel
            key={activeThread.id}
            thread={activeThread}
            persistedMessages={activeMessages}
            onPersistedRefresh={refreshActiveThread}
          />
        )}
      </div>
    </div>
  );
}
