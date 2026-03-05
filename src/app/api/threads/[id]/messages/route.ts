import {
  consumeStream,
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertApiKeyConfigured, getModel, MissingApiKeyError } from "@/lib/ai-provider";
import { badRequest, notFound } from "@/lib/http";
import { snapshotFromThread } from "@/lib/mode-service";
import { assembleModeContext } from "@/lib/prompt-assembly";
import { queryRagService } from "@/lib/rag-client";

type Params = {
  params: Promise<{ id: string }>;
};

type IncomingBody = {
  trigger?: "submit-message" | "regenerate-message";
  messageId?: string;
  messages?: UIMessage[];
};

type PersistedChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function uiText(message: UIMessage | undefined): string {
  if (!message) {
    return "";
  }

  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text;
}

function asModelInput(messages: PersistedChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    parts: [
      {
        type: "text" as const,
        text: message.content,
      },
    ],
  }));
}

export const maxDuration = 45;

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as IncomingBody;
  const trigger = body.trigger ?? "submit-message";

  const thread = await db.conversationThread.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!thread) {
    return notFound("Thread not found.");
  }

  const persistedMessages: PersistedChatMessage[] = thread.messages
    .filter((message): message is typeof message & { role: "user" | "assistant" } =>
      message.role === "user" || message.role === "assistant"
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    }));

  let workingMessages: PersistedChatMessage[] = [...persistedMessages];

  if (trigger === "submit-message") {
    const lastMessage = body.messages?.[body.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return badRequest("Expected a user message in request payload.");
    }

    const messageText = uiText(lastMessage);
    if (!messageText) {
      return badRequest("User message cannot be empty.");
    }

    const userMessage = await db.message.create({
      data: {
        threadId: thread.id,
        role: "user",
        content: messageText,
      },
    });

    workingMessages = [...workingMessages, {
      id: userMessage.id,
      role: "user",
      content: messageText,
    }];

    await db.conversationThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
      },
    });
  }

  if (trigger === "regenerate-message") {
    let assistantToDelete = workingMessages
      .slice()
      .reverse()
      .find((message) => message.role === "assistant");

    if (body.messageId) {
      assistantToDelete = workingMessages.find(
        (message) => message.id === body.messageId && message.role === "assistant"
      );
    }

    if (assistantToDelete) {
      await db.message.delete({
        where: { id: assistantToDelete.id },
      });

      workingMessages = workingMessages.filter((message) => message.id !== assistantToDelete.id);
    }

    if (workingMessages.filter((message) => message.role === "user").length === 0) {
      return badRequest("Cannot regenerate without at least one user message.");
    }
  }

  const latestUser = [...workingMessages].reverse().find((message) => message.role === "user");
  if (!latestUser) {
    return badRequest("Missing latest user message for generation.");
  }

  const modeSnapshot = snapshotFromThread(thread);
  const assembly = assembleModeContext(modeSnapshot);

  const ragResult = await queryRagService({
    query: latestUser.content,
    k: 5,
  });

  const retrievalContext =
    ragResult.available && ragResult.context.trim().length > 0
      ? ragResult.context
      : "No retrieval matches returned.";

  const ragStatus = ragResult.available
    ? `RAG available with ${ragResult.matchCount} source(s).`
    : `RAG unavailable: ${ragResult.error || "unknown error"}`;

  const system = [
    assembly.text,
    "",
    "RAG Retrieval Context:",
    retrievalContext,
    "",
    `RAG Status: ${ragStatus}`,
    "When sources are available, ground claims in the retrieval context and cite them inline like [1], [2].",
    "If retrieval context is empty or unavailable, state that clearly and continue with best-effort Stoic guidance.",
  ].join("\n");

  try {
    assertApiKeyConfigured();
    const result = streamText({
      model: getModel(),
      system,
      messages: await convertToModelMessages(asModelInput(workingMessages)),
      onError: ({ error }) => {
        console.error("[chat-stream]", error);
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: asModelInput(workingMessages) as UIMessage[],
      consumeSseStream: ({ stream }) => consumeStream({ stream }),
      onFinish: async ({ responseMessage, finishReason }) => {
        const assistantText = responseMessage.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("\n");

        await db.message.create({
          data: {
            threadId: thread.id,
            role: "assistant",
            content: assistantText,
            citations: ragResult.sources,
            debugContext: {
              promptAssembly: assembly.debug,
              ragStatus,
              ragError: ragResult.error ?? null,
              finishReason,
            },
          },
        });

        await db.conversationThread.update({
          where: { id: thread.id },
          data: {
            updatedAt: new Date(),
          },
        });
      },
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json(
        {
          error: error.message,
          remediation: error.remediation,
          hint: "Set OPENAI_API_KEY in .env.local.",
        },
        { status: 503 }
      );
    }

    throw error;
  }
}
