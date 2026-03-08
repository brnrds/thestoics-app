import {
  consumeStream,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildSkillsPrompt,
  discoverFileSystemSkills,
  mergeSkills,
  snapshotSkillsToRuntimeSkills,
  type RuntimeSkill,
} from "@/lib/agent-skills";
import { authErrorToResponse, requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertApiKeyConfigured, getModel, MissingApiKeyError } from "@/lib/ai-provider";
import { badRequest, notFound } from "@/lib/http";
import { discardLegacyThreads } from "@/lib/legacy-thread-cleanup";
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

const loadSkillInputSchema = z.object({
  name: z.string().min(1).describe("The exact skill name to load."),
});

function findSkillByName(skills: RuntimeSkill[], name: string) {
  return skills.find((skill) => skill.name.toLowerCase() === name.trim().toLowerCase());
}

export const maxDuration = 45;

export async function POST(request: Request, { params }: Params) {
  try {
    await discardLegacyThreads();
    const { id } = await params;
    const { appUser } = await requireCurrentUser(request);
    const body = (await request.json().catch(() => ({}))) as IncomingBody;
    const trigger = body.trigger ?? "submit-message";

    const thread = await db.conversationThread.findFirst({
      where: {
        id,
        userId: appUser.id,
      },
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

      workingMessages = [
        ...workingMessages,
        {
          id: userMessage.id,
          role: "user",
          content: messageText,
        },
      ];

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
    const fileSkills = await discoverFileSystemSkills([
      `${process.cwd()}/.agents/skills`,
    ]);
    const availableSkills = mergeSkills(fileSkills, snapshotSkillsToRuntimeSkills(modeSnapshot));

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
      buildSkillsPrompt(
        availableSkills.map((skill) => ({
          name: skill.name,
          description: skill.description,
        }))
      ),
      "",
      "RAG Retrieval Context:",
      retrievalContext,
      "",
      `RAG Status: ${ragStatus}`,
      "Treat retrieval context as the primary evidence base for this reply.",
      "When sources are available, prefer claims supported by retrieved passages over generic background knowledge.",
      "Cite source-backed claims inline like [1], [2], and if retrieval only partially answers the question, say what is supported and what remains uncertain.",
      "If retrieval context is empty or unavailable, state that clearly and continue with best-effort Stoic guidance.",
    ].join("\n");

    try {
      assertApiKeyConfigured();
      const result = streamText({
        model: getModel(),
        system,
        messages: await convertToModelMessages(asModelInput(workingMessages)),
        tools: {
          loadSkill: tool({
            description:
              "Load a skill to get specialized instructions before answering the user.",
            inputSchema: loadSkillInputSchema,
            strict: true,
            execute: async ({ name }, { experimental_context }) => {
              const context = experimental_context as { skills: RuntimeSkill[] };
              const skill = findSkillByName(context.skills, name);

              if (!skill) {
                return { error: `Skill '${name}' not found.` };
              }

              return {
                skillName: skill.name,
                skillDirectory: skill.path ?? null,
                content: skill.body,
              };
            },
          }),
        },
        stopWhen: stepCountIs(5),
        experimental_context: {
          skills: availableSkills,
        },
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
  } catch (error) {
    const response = authErrorToResponse(error);
    if (response) {
      return response;
    }

    throw error;
  }
}
