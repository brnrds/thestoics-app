import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

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
    context: "[1] Source: Meditations\nFocus on what is in your control.",
    sources: [
      {
        source: "Meditations",
        excerpt: "Focus on what is in your control.",
        page: 12,
      },
    ],
    matchCount: 1,
  })),
}));

vi.mock("ai", () => ({
  consumeStream: vi.fn(async () => undefined),
  convertToModelMessages: vi.fn(async (messages) => messages),
  stepCountIs: vi.fn((count: number) => ({ type: "stepCountIs", count })),
  tool: vi.fn((definition) => definition),
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

function stubHeaders(userId: string, role: "user" | "admin" = "user") {
  return {
    "x-stub-user-id": userId,
    "x-stub-user-role": role,
    "x-stub-session-id": `sess_${userId.replace(/^user_/, "")}`,
  };
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
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_owner"),
        },
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
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_owner"),
        },
        body: JSON.stringify({ title: "Evening Reflection" }),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );

    expect(renameRes.status).toBe(200);

    const listRes = await listThreads(
      new Request("http://localhost/api/threads", {
        headers: stubHeaders("user_stub_owner"),
      })
    );
    const listPayload = (await listRes.json()) as { threads: Array<{ id: string; title: string }> };
    expect(listPayload.threads).toHaveLength(1);
    expect(listPayload.threads[0].title).toBe("Evening Reflection");

    const deleteRes = await deleteThread(
      new Request(`http://localhost/api/threads/${threadId}`, {
        method: "DELETE",
        headers: stubHeaders("user_stub_owner"),
      }),
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
    const { streamText } = await import("ai");

    const { mode } = await createModeFixture();

    const createRes = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_sender"),
        },
        body: JSON.stringify({ title: "Send Flow", modeId: mode.id }),
      })
    );

    const createPayload = (await createRes.json()) as { thread: { id: string } };
    const threadId = createPayload.thread.id;

    const sendRes = await sendMessage(
      new Request(`http://localhost/api/threads/${threadId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_sender"),
        },
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

    expect(vi.mocked(streamText)).toHaveBeenCalled();
    const streamArgs = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(streamArgs?.tools?.loadSkill).toBeDefined();
    expect(streamArgs?.stopWhen).toEqual({ type: "stepCountIs", count: 5 });
    expect(streamArgs?.system).toContain("Treat retrieval context as the primary evidence base");
    expect(streamArgs?.system).not.toContain("rag-source-grounding");
  });
});

describe("multi-user isolation", () => {
  it("prevents a second user from listing or mutating another user's thread", async () => {
    const { POST: createThread, GET: listThreads } = await import("@/app/api/threads/route");
    const { GET: getThread, PATCH: renameThread, DELETE: deleteThread } = await import(
      "@/app/api/threads/[id]/route"
    );
    const { POST: sendMessage } = await import("@/app/api/threads/[id]/messages/route");

    const { mode } = await createModeFixture();

    const createRes = await createThread(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_testA"),
        },
        body: JSON.stringify({ title: "Private Thread", modeId: mode.id }),
      })
    );

    expect(createRes.status).toBe(201);
    const createPayload = (await createRes.json()) as { thread: { id: string } };
    const threadId = createPayload.thread.id;

    const ownerListRes = await listThreads(
      new Request("http://localhost/api/threads", {
        headers: stubHeaders("user_stub_testA"),
      })
    );
    const ownerListPayload = (await ownerListRes.json()) as { threads: Array<{ id: string }> };
    expect(ownerListPayload.threads).toHaveLength(1);
    expect(ownerListPayload.threads[0].id).toBe(threadId);

    const strangerListRes = await listThreads(
      new Request("http://localhost/api/threads", {
        headers: stubHeaders("user_stub_testB"),
      })
    );
    const strangerListPayload = (await strangerListRes.json()) as { threads: Array<{ id: string }> };
    expect(strangerListRes.status).toBe(200);
    expect(strangerListPayload.threads).toHaveLength(0);

    const strangerGetRes = await getThread(
      new Request(`http://localhost/api/threads/${threadId}`, {
        headers: stubHeaders("user_stub_testB"),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );
    expect(strangerGetRes.status).toBe(404);

    const strangerRenameRes = await renameThread(
      new Request(`http://localhost/api/threads/${threadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_testB"),
        },
        body: JSON.stringify({ title: "Hacked Title" }),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );
    expect(strangerRenameRes.status).toBe(404);

    const strangerMessageRes = await sendMessage(
      new Request(`http://localhost/api/threads/${threadId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...stubHeaders("user_stub_testB"),
        },
        body: JSON.stringify({
          trigger: "submit-message",
          messages: [
            {
              id: "client-user-1",
              role: "user",
              parts: [{ type: "text", text: "Can I see this thread?" }],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );
    expect(strangerMessageRes.status).toBe(404);

    const strangerDeleteRes = await deleteThread(
      new Request(`http://localhost/api/threads/${threadId}`, {
        method: "DELETE",
        headers: stubHeaders("user_stub_testB"),
      }),
      { params: Promise.resolve({ id: threadId }) }
    );
    expect(strangerDeleteRes.status).toBe(404);

    const storedThread = await db.conversationThread.findUnique({ where: { id: threadId } });
    expect(storedThread).not.toBeNull();
  });
});

describe("legacy thread discard", () => {
  it("deletes unowned beta threads when thread APIs are accessed", async () => {
    const { GET: listThreads } = await import("@/app/api/threads/route");

    const { mode } = await createModeFixture();
    const legacyThread = await db.conversationThread.create({
      data: {
        userId: null,
        title: "Legacy Thread",
        modeId: mode.id,
        modeNameSnapshot: mode.name,
        modeSlugSnapshot: mode.slug,
        modeDescriptionSnapshot: mode.description,
        modePromptSnapshot: [],
        modeSkillSnapshot: [],
      },
    });

    const listRes = await listThreads(
      new Request("http://localhost/api/threads", {
        headers: stubHeaders("user_stub_cleanup"),
      })
    );

    expect(listRes.status).toBe(200);
    const existing = await db.conversationThread.findUnique({
      where: { id: legacyThread.id },
    });
    expect(existing).toBeNull();
  });
});

describe("admin auth helper", () => {
  it("rejects non-admin identities", async () => {
    await expect(
      requireAdmin(
        new Request("http://localhost/api/admin/modes", {
          headers: stubHeaders("user_stub_non_admin"),
        })
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});
