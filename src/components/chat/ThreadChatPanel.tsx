"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { MessageRecord, ThreadRecord } from "@/lib/contracts";

type Props = {
  thread: ThreadRecord;
  persistedMessages: MessageRecord[];
  onPersistedRefresh: () => Promise<void>;
};

const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  return "webm";
}

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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingVoiceReply, setIsGeneratingVoiceReply] = useState(false);
  const [voiceReplyTargetMessageId, setVoiceReplyTargetMessageId] = useState<
    string | null
  >(null);
  const [voiceRepliesByMessageId, setVoiceRepliesByMessageId] = useState<
    Record<string, string>
  >({});

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const pendingVoiceReplyRef = useRef<{
    assistantCountAtSend: number;
  } | null>(null);

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
        body,
      }) => ({
        body: { ...body, id, messages: uiMessages, trigger, messageId },
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

  useEffect(
    () => () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.ondataavailable = null;
        recorder.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const isStreaming = status === "submitted" || status === "streaming";
  const statusLabel = isRecording
    ? "Listening..."
    : isTranscribing
      ? "Transcribing voice..."
      : isGeneratingVoiceReply
        ? "Generating voice reply..."
        : isStreaming
          ? ""
          : "\u2318 Enter to send";
  const canToggleMic =
    isRecording || (!isStreaming && !isTranscribing && !isGeneratingVoiceReply);

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

  const stopMediaCapture = () => {
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const requestVoiceReply = useCallback(
    async (assistantMessageId: string, text: string) => {
      setIsGeneratingVoiceReply(true);
      setVoiceReplyTargetMessageId(assistantMessageId);
      setVoiceError(null);

      try {
        const response = await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            model: "tts-1",
            voice: "alloy",
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof data?.error === "string"
              ? data.error
              : "Voice reply generation failed.";
          setVoiceError(message);
          return;
        }

        if (typeof data?.dataUrl !== "string" || !data.dataUrl.trim()) {
          setVoiceError("No audio was returned for the assistant response.");
          return;
        }

        setVoiceRepliesByMessageId((current) => ({
          ...current,
          [assistantMessageId]: data.dataUrl as string,
        }));

        const audio = new Audio(data.dataUrl as string);
        void audio.play().catch(() => {
          // Autoplay can be blocked; keep audio controls visible for manual playback.
        });
      } catch (error) {
        setVoiceError(
          error instanceof Error
            ? error.message
            : "Voice reply generation failed."
        );
      } finally {
        setIsGeneratingVoiceReply(false);
        setVoiceReplyTargetMessageId(null);
      }
    },
    []
  );

  useEffect(() => {
    if (status !== "ready") return;

    const pending = pendingVoiceReplyRef.current;
    if (!pending) return;

    const assistantMessages = messages.filter((message) => message.role === "assistant");
    if (assistantMessages.length <= pending.assistantCountAtSend) return;

    const latestAssistant = assistantMessages[assistantMessages.length - 1];
    if (voiceRepliesByMessageId[latestAssistant.id]) {
      pendingVoiceReplyRef.current = null;
      return;
    }

    const assistantText = messageText(latestAssistant).trim();
    pendingVoiceReplyRef.current = null;

    if (!assistantText) return;
    void requestVoiceReply(latestAssistant.id, assistantText);
  }, [messages, requestVoiceReply, status, voiceRepliesByMessageId]);

  const transcribeAndSend = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setVoiceError(null);

    try {
      const extension = extensionFromMimeType(audioBlob.type || "audio/webm");
      const file = new File([audioBlob], `voice-input.${extension}`, {
        type: audioBlob.type || "audio/webm",
      });

      const formData = new FormData();
      formData.append("audio", file);
      formData.append("model", "gpt-4o-mini-transcribe");

      const response = await fetch("/api/transcription", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Transcription failed.";
        setVoiceError(message);
        return;
      }

      const transcript = typeof data?.text === "string" ? data.text.trim() : "";
      if (!transcript) {
        setVoiceError("No transcript was generated from your recording.");
        return;
      }

      const assistantCount = messages.filter(
        (message) => message.role === "assistant"
      ).length;
      pendingVoiceReplyRef.current = { assistantCountAtSend: assistantCount };
      await sendMessage({ text: transcript });
    } catch (error) {
      pendingVoiceReplyRef.current = null;
      setVoiceError(
        error instanceof Error ? error.message : "Failed to process voice input."
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleMicrophoneClick = async () => {
    setVoiceError(null);

    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      return;
    }

    if (!canToggleMic) return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceError("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];

      const selectedMimeType = RECORDING_MIME_TYPES.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
      );
      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setVoiceError("Microphone recording failed.");
        stopMediaCapture();
        setIsRecording(false);
      };

      recorder.onstop = () => {
        const mimeType =
          recorder.mimeType ||
          recordingChunksRef.current[0]?.type ||
          "audio/webm";
        const audioBlob = new Blob(recordingChunksRef.current, {
          type: mimeType,
        });

        stopMediaCapture();
        setIsRecording(false);

        if (audioBlob.size === 0) {
          setVoiceError("No audio captured. Please try again.");
          return;
        }

        void transcribeAndSend(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      stopMediaCapture();
      setIsRecording(false);
      setVoiceError(
        error instanceof Error
          ? error.message
          : "Unable to access your microphone."
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (input.trim() && !isStreaming) {
        pendingVoiceReplyRef.current = null;
        setVoiceError(null);
        void sendMessage({ text: input.trim() });
        setInput("");
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
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

                {voiceReplyTargetMessageId === message.id &&
                isGeneratingVoiceReply ? (
                  <p className="mt-3 font-sans text-xs text-ink-tertiary">
                    Generating voice reply...
                  </p>
                ) : null}

                {voiceRepliesByMessageId[message.id] ? (
                  <audio
                    controls
                    preload="none"
                    src={voiceRepliesByMessageId[message.id]}
                    className="mt-3 max-w-full"
                  >
                    Your browser does not support the audio element.
                  </audio>
                ) : null}

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
      {voiceError && (
        <div className="px-6 py-2">
          <p className="font-sans text-xs text-danger">{voiceError}</p>
        </div>
      )}

      {/* ── Composer ────────────────────────────────────────────────────── */}
      <div className="border-t border-rule px-6 py-4">
        <div className="mx-auto max-w-[700px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || isStreaming) return;
              pendingVoiceReplyRef.current = null;
              setVoiceError(null);
              void sendMessage({ text: input.trim() });
              setInput("");
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                className="input-base field-sizing-content min-h-[44px] w-full resize-none"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask for Stoic counsel..."
                disabled={isStreaming}
                rows={1}
              />
              <button
                type="button"
                onClick={() => void handleMicrophoneClick()}
                disabled={!canToggleMic}
                aria-label={isRecording ? "Stop recording" : "Start voice input"}
                title={isRecording ? "Stop recording" : "Voice input"}
                className={`flex h-[44px] w-[44px] items-center justify-center rounded-md border transition-colors disabled:opacity-30 ${
                  isRecording
                    ? "border-danger text-danger"
                    : "border-rule text-ink-tertiary hover:bg-surface-alt hover:text-ink-secondary"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="1.5"
                    width="6"
                    height="9"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M3.5 7.5V8.1C3.5 10.6 5.5 12.6 8 12.6C10.5 12.6 12.5 10.6 12.5 8.1V7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 12.6V14.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M5.6 14.5H10.4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="font-sans text-[11px] text-ink-tertiary">
                {statusLabel}
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
