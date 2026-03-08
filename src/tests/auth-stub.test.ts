import { afterEach, describe, expect, it } from "vitest";

const mutableEnv = process.env as Record<string, string | undefined>;
const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  ADMIN_STUB_ENABLED: process.env.ADMIN_STUB_ENABLED,
};

afterEach(() => {
  if (ORIGINAL_ENV.NODE_ENV === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  }

  if (ORIGINAL_ENV.ADMIN_STUB_ENABLED === undefined) {
    delete mutableEnv.ADMIN_STUB_ENABLED;
  } else {
    mutableEnv.ADMIN_STUB_ENABLED = ORIGINAL_ENV.ADMIN_STUB_ENABLED;
  }
});

describe("stub auth security boundaries", () => {
  it("ignores stub override headers outside tests", async () => {
    mutableEnv.NODE_ENV = "development";
    mutableEnv.ADMIN_STUB_ENABLED = "true";

    const { auth } = await import("@/lib/auth");
    const result = await auth(
      new Request("http://localhost/api/threads", {
        headers: {
          "x-stub-user-id": "user_stub_impersonated",
          "x-stub-user-role": "admin",
          "x-stub-session-id": "sess_stub_impersonated",
        },
      })
    );

    expect(result.userId).toBe("user_stub_user1");
    expect(result.sessionClaims?.metadata?.role).toBeUndefined();
  });

  it("does not treat ADMIN_STUB_ENABLED=false as implicit admin", async () => {
    mutableEnv.NODE_ENV = "development";
    mutableEnv.ADMIN_STUB_ENABLED = "false";

    const { auth, validateAdminToken } = await import("@/lib/auth");
    const result = await auth(new Request("http://localhost/admin"));

    expect(result.userId).toBe("user_stub_user1");
    expect(result.sessionClaims?.metadata?.role).toBeUndefined();
    expect(validateAdminToken("stoics-admin")).toBe(false);
  });
});
