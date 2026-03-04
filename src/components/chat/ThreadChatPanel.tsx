"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

export function ThreadChatPanel({
  thread,
  persistedMessages,
  onPersistedRefresh,
}: Props) {
  const [input, setInput] = useState("");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const initialUiMessages = useMemo(
    () =>
      persistedMessages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: [{ type: "text" as const, text: message.content }],
      })),
    [persistedMessages]
  );

  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    id: thread.id,
    messages: initialUiMessages,
    transport: new DefaultChatTransport({
      api: `/api/threads/${thread.id}/messages`,
      prepareSendMessagesRequest: ({
        id,
        messages: uiMessages,
        trigger,
        messageId,
      }) => ({
        body: { id, messages: uiMessages, trigger, messageId },
      }),
    }),
  });
  const previousStatusRef = useRef(status);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (previousStatus !== "ready" && status === "ready") {
      void onPersistedRefresh();
    }
    previousStatusRef.current = status;
  }, [status, onPersistedRefresh]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isStreaming = status === "submitted" || status === "streaming";

  const persistedAssistantMessages = persistedMessages.filter(
    (m) => m.role === "assistant"
  );
  const citationLookup = useMemo(() => {
    const assistantIds = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.id);
    return new Map(
      assistantIds.map((id, index) => [
        id,
        persistedAssistantMessages[index] || null,
      ])
    );
  }, [messages, persistedAssistantMessages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (input.trim() && !isStreaming) {
        sendMessage({ text: input.trim() });
        setInput("");
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Thread header ───────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between border-b border-rule px-6 py-3">
        <div>
          <h2 className="text-lg">{thread.title}</h2>
          <p className="font-sans text-xs text-ink-tertiary">
            {thread.modeSnapshot.modeName} · {thread.modeSnapshot.modeSlug}
          </p>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[700px] space-y-6 px-6 py-8">
          {messages.length === 0 && (
            <p className="py-12 text-center font-sans text-sm text-ink-tertiary">
              Send a message to begin the conversation.
            </p>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            const text = messageText(message);
            const persistedAssistant = !isUser
              ? citationLookup.get(message.id)
              : null;

            if (isUser) {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-ink px-4 py-3">
                    <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-canvas">
                      {text}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div key={message.id}>
                <div className="whitespace-pre-wrap text-base leading-[1.85]">
                  {text}
                </div>

                {persistedAssistant?.citations?.length ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer select-none font-sans text-xs text-ink-tertiary transition-colors hover:text-ink-secondary">
                      {persistedAssistant.citations.length} source
                      {persistedAssistant.citations.length > 1 ? "s" : ""} cited
                    </summary>
                    <ol className="mt-3 list-decimal space-y-2 border-t border-rule-light pt-3 pl-5">
                      {persistedAssistant.citations.map((citation, index) => (
                        <li
                          key={`${citation.source}-${index}`}
                          className="text-sm leading-relaxed text-ink-secondary"
                        >
                          <span className="font-medium text-ink">
                            {citation.source}
                          </span>
                          {typeof citation.page === "number"
                            ? ` (p.\u2009${citation.page})`
                            : ""}
                          {citation.excerpt && (
                            <p className="mt-1 text-xs text-ink-tertiary italic">
                              {citation.excerpt}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex items-center gap-1.5 py-2">
              <span
                className="h-1.5 w-1.5 rounded-full bg-ink-tertiary animate-pulse-dot"
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-ink-tertiary animate-pulse-dot"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-ink-tertiary animate-pulse-dot"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
          )}

          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="px-6 py-2">
          <p className="font-sans text-xs text-danger">
            {error instanceof Error ? error.message : "Request failed."}
          </p>
        </div>
      )}

      {/* ── Composer ────────────────────────────────────────────────────── */}
      <div className="border-t border-rule px-6 py-4">
        <div className="mx-auto max-w-[700px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || isStreaming) return;
              sendMessage({ text: input.trim() });
              setInput("");
            }}
          >
            <textarea
              className="input-base field-sizing-content min-h-[44px] w-full resize-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for Stoic counsel…"
              disabled={isStreaming}
              rows={1}
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="font-sans text-[11px] text-ink-tertiary">
                {isStreaming ? "" : "\u2318 Enter to send"}
              </p>
              <div className="flex gap-2">
                {isStreaming ? (
                  <button
                    type="button"
                    className="rounded-md border border-rule px-3 py-1.5 font-sans text-xs text-ink-secondary transition-colors hover:bg-surface-alt"
                    onClick={() => stop()}
                  >
                    Stop
                  </button>
                ) : (
                  <>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        className="rounded-md px-3 py-1.5 font-sans text-xs text-ink-tertiary transition-colors hover:text-ink-secondary"
                        onClick={() => regenerate()}
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="submit"
                      className="rounded-md bg-ink px-4 py-1.5 font-sans text-xs font-medium text-canvas transition-opacity hover:opacity-85 disabled:opacity-30"
                      disabled={!input.trim()}
                    >
                      Send
                    </button>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
