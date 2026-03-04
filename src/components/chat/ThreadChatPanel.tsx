"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { MessageRecord, ThreadRecord } from "@/lib/contracts";

type Props = {
  thread: ThreadRecord;
  persistedMessages: MessageRecord[];
  onPersistedRefresh: () => Promise<void>;
};

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function ThreadChatPanel({ thread, persistedMessages, onPersistedRefresh }: Props) {
  const [input, setInput] = useState("");

  const initialUiMessages = useMemo(
    () =>
      persistedMessages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: [{ type: "text" as const, text: message.content }],
      })),
    [persistedMessages]
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    error,
  } = useChat({
    id: thread.id,
    messages: initialUiMessages,
    transport: new DefaultChatTransport({
      api: `/api/threads/${thread.id}/messages`,
      prepareSendMessagesRequest: ({ id, messages: uiMessages, trigger, messageId }) => ({
        body: { id, messages: uiMessages, trigger, messageId },
      }),
    }),
  });

  useEffect(() => {
    if (status === "ready") {
      void onPersistedRefresh();
    }
  }, [status, onPersistedRefresh]);

  const isStreaming = status === "submitted" || status === "streaming";

  const persistedAssistantMessages = persistedMessages.filter((message) => message.role === "assistant");
  const citationLookup = useMemo(() => {
    const assistantIds = messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.id);

    return new Map(
      assistantIds.map((id, index) => [id, persistedAssistantMessages[index] || null])
    );
  }, [messages, persistedAssistantMessages]);

  return (
    <section className="card-surface flex h-[78vh] flex-col p-4 sm:p-5">
      <div className="mb-3 border-b border-[var(--color-clay-700)]/22 pb-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-clay-700)]">Interaction Mode</p>
        <h2 className="text-2xl font-semibold">{thread.modeSnapshot.modeName}</h2>
        <p className="text-sm text-[var(--color-clay-700)]">{thread.modeSnapshot.modeSlug} • Shared RAG enabled</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--color-clay-700)]">No messages yet. Send one to start.</p>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const text = messageText(message);
          const persistedAssistant = !isUser ? citationLookup.get(message.id) : null;

          return (
            <article
              key={message.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  isUser
                    ? "bg-[var(--color-ink-900)] text-white"
                    : "border border-[var(--color-clay-700)]/25 bg-white/85 text-[var(--color-ink-900)]"
                }`}
              >
                <p className="mb-1 text-[10px] uppercase tracking-[0.16em] opacity-75">
                  {isUser ? "User" : "Assistant"}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{text}</p>

                {!isUser && persistedAssistant?.citations?.length ? (
                  <details className="mt-3 rounded-xl border border-[var(--color-clay-700)]/24 bg-[var(--color-sand-100)]/60 p-2">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-clay-700)]">
                      Sources ({persistedAssistant.citations.length})
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs text-[var(--color-clay-700)]">
                      {persistedAssistant.citations.map((citation, index) => (
                        <li key={`${citation.source}-${index}`}>
                          <p className="font-semibold text-[var(--color-ink-900)]">
                            [{index + 1}] {citation.source}
                            {typeof citation.page === "number" ? ` (p.${citation.page})` : ""}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{citation.excerpt}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-700">
          {error instanceof Error ? error.message : "Chat request failed."}
        </p>
      ) : null}

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || isStreaming) {
            return;
          }

          sendMessage({ text: input.trim() });
          setInput("");
        }}
      >
        <textarea
          className="input-base field-sizing-content min-h-11 w-full"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask for Stoic counsel..."
          disabled={isStreaming}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-full bg-[var(--color-olive-500)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isStreaming || !input.trim()}
          >
            Send
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--color-clay-700)]/45 px-4 py-2 text-sm disabled:opacity-60"
            disabled={!isStreaming}
            onClick={() => stop()}
          >
            Stop
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--color-rust-500)]/65 px-4 py-2 text-sm text-[var(--color-rust-500)] disabled:opacity-60"
            disabled={isStreaming || messages.length === 0}
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      </form>
    </section>
  );
}
