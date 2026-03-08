import { createHash } from "node:crypto";
import { UserRole, type User } from "@prisma/client";
import { db } from "@/lib/db";

export type SeedUserInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
};

const DEFAULT_DEV_USERS: SeedUserInput[] = [
  {
    email: "marcus.aurelius@stub.local",
    firstName: "Marcus",
    lastName: "Aurelius",
    role: UserRole.USER,
  },
  {
    email: "seneca@stub.local",
    firstName: "Seneca",
    role: UserRole.USER,
  },
  {
    email: "epictetus@stub.local",
    firstName: "Epictetus",
    role: UserRole.USER,
  },
];

function buildName(firstName?: string, lastName?: string) {
  const displayName = [firstName?.trim(), lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  return displayName || null;
}

function titleCaseFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildStubAuthProviderUserId(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const slug = normalizedEmail
    .split("@")[0]
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const digest = createHash("sha1").update(normalizedEmail).digest("hex").slice(0, 10);

  return `user_stub_${slug || "user"}-${digest}`;
}

export async function upsertSeedUser(input: SeedUserInput): Promise<User> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName = buildName(input.firstName, input.lastName) || titleCaseFromEmail(normalizedEmail);
  const authProviderUserId = buildStubAuthProviderUserId(normalizedEmail);
  const role = input.role ?? UserRole.USER;

  return db.user.upsert({
    where: { authProviderUserId },
    update: {
      email: normalizedEmail,
      displayName,
      role,
    },
    create: {
      authProviderUserId,
      email: normalizedEmail,
      displayName,
      role,
    },
  });
}

export async function seedDefaultDevUsers() {
  await Promise.all(DEFAULT_DEV_USERS.map((user) => upsertSeedUser(user)));

  return db.user.findMany({
    where: {
      authProviderUserId: {
        in: DEFAULT_DEV_USERS.map((user) => buildStubAuthProviderUserId(user.email)),
      },
    },
    include: {
      _count: {
        select: {
          threads: true,
        },
      },
    },
    orderBy: { email: "asc" },
  });
}
