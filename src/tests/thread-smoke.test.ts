import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/ai-provider", () => ({
  assertApiKeyConfigured: vi.fn(),
  getModel: vi.fn(() => ({ provider: "mock", modelId: "mock-model" })),
  MissingApiKeyError: class MissingApiKeyError extends Error {
    remediation = "mock remediation";
  },
}));

vi.mock("@/lib/rag-client", () => ({
  queryRagService: vi.fn(async () => ({
    available: true,
    response: "",
    sources: [
      {
        source: "Meditations",
        excerpt: "Focus on what is in your control.",
        page: 12,
      },
    ],
  })),
}));

vi.mock("ai", () => ({
  consumeStream: vi.fn(async () => undefined),
  convertToModelMessages: vi.fn(async (messages) => messages),
  streamText: vi.fn(() => ({
    toUIMessageStreamResponse: async (options?: {
      onFinish?: (event: {
        responseMessage: {
          parts: Array<{ type: string; text?: string }>;
        };
        finishReason: string;
      }) => Promise<void>;
    }) => {
      if (options?.onFinish) {
        await options.onFinish({
          responseMessage: {
            parts: [{ type: "text", text: "Mock assistant response" }],
          },
          finishReason: "stop",
        });
      }
      return new Response("data: done\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  })),
}));

function uniqueId() {
  return `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function createModeFixture() {
  const id = uniqueId();
  const prompt = await db.prompt.create({
    data: {
      name: `Fixture Prompt ${id}`,
      role: "SYSTEM",
      content: "Stay calm.",
    },
  });

  const skill = await db.skill.create({
    data: {
      name: `Fixture Skill ${id}`,
      description: "Reframe",
      body: "Reframe concerns into actions.",
    },
  });

  const mode = await db.interactionMode.create({
    data: {
      name: `Fixture Mode ${id}`,
      slug: `fixture-mode-${id}`,
      description: "Fixture mode",
      active: true,
      isDefault: true,
    },
  });

  await db.modePrompt.create({
    data: {
      modeId: mode.id,
      promptId: prompt.id,
      order: 0,
    },
  });

  await db.modeSkill.create({
    data: {
      modeId: mode.id,
      skillId: skill.id,
      order: 0,
    },
  });

  return { mode };
}

describe("thread CRUD smoke", () => {
  it("creates, renames, lists, and deletes thread records", async () => {
    const { POST: createThread, GET: listThreads } = await import("@/app/api/threads/route");
    const { PATCH: renameThread, DELETE: deleteThread } = await import("@/app/api/threads/[id]/route");

    const { mode } = await createModeFixture();

    const createRes = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Morning Reflection", modeId: mode.id }),
      })
    );

    expect(createRes.status).toBe(201);
    const createPayload = (await createRes.json()) as { thread: { id: string; title: string } };
    expect(createPayload.thread.title).toBe("Morning Reflection");

    const threadId = createPayload.thread.id;

    const renameRes = await renameThread(
      new Request(`http://localhost/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Evening Reflection" }),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );

    expect(renameRes.status).toBe(200);

    const listRes = await listThreads();
    const listPayload = (await listRes.json()) as { threads: Array<{ id: string; title: string }> };
    expect(listPayload.threads).toHaveLength(1);
    expect(listPayload.threads[0].title).toBe("Evening Reflection");

    const deleteRes = await deleteThread(
      new Request(`http://localhost/api/threads/${threadId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: threadId }) }
    );

    expect(deleteRes.status).toBe(200);

    const deleted = await db.conversationThread.findUnique({ where: { id: threadId } });
    expect(deleted).toBeNull();
  });
});

describe("message send smoke", () => {
  it("persists user and assistant messages in one send flow", async () => {
    const { POST: createThread } = await import("@/app/api/threads/route");
    const { POST: sendMessage } = await import("@/app/api/threads/[id]/messages/route");

    const { mode } = await createModeFixture();

    const createRes = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Send Flow", modeId: mode.id }),
      })
    );

    const createPayload = (await createRes.json()) as { thread: { id: string } };
    const threadId = createPayload.thread.id;

    const sendRes = await sendMessage(
      new Request(`http://localhost/api/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: "submit-message",
          messages: [
            {
              id: "client-user-1",
              role: "user",
              parts: [{ type: "text", text: "How can I handle anxiety at work?" }],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );

    expect(sendRes.status).toBe(200);

    const storedMessages = await db.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    expect(storedMessages).toHaveLength(2);
    expect(storedMessages[0].role).toBe("user");
    expect(storedMessages[1].role).toBe("assistant");
    expect(storedMessages[1].content).toContain("Mock assistant response");
    expect(Array.isArray(storedMessages[1].citations)).toBe(true);
  });
});
