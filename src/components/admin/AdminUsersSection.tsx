"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AdminUserRecord } from "@/lib/contracts";

type UserRoleValue = AdminUserRecord["role"];

type UserSeedForm = {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRoleValue;
};

const ROLE_OPTIONS: UserRoleValue[] = ["USER", "ADMIN"];

const initialForm: UserSeedForm = {
  email: "",
  firstName: "",
  lastName: "",
  role: "USER",
};

function buildStubAuthProviderUserIdPreview(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return "user_stub_<generated-from-email>";
  }

  const slug = normalized
    .split("@")[0]
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return `user_stub_${slug || "user"}-<hash>`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function AdminUsersSection() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [form, setForm] = useState<UserSeedForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bulkSeeding, setBulkSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewAuthProviderUserId = useMemo(
    () => buildStubAuthProviderUserIdPreview(form.email),
    [form.email]
  );

  const loadUsers = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { users?: AdminUserRecord[]; error?: string }
      | null;

    if (!response.ok) {
      setError(payload?.error || "Failed to load users.");
      setLoading(false);
      return;
    }

    setUsers(payload?.users ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = (await response.json().catch(() => null)) as
      | { user?: AdminUserRecord; error?: string }
      | null;
    setSubmitting(false);

    if (!response.ok) {
      setError(payload?.error || "Failed to seed user.");
      return;
    }

    setForm(initialForm);
    setNotice(
      payload?.user?.email
        ? `Seeded ${payload.user.email}.`
        : "User created for development."
    );
    await loadUsers();
  };

  const onSeedDefaults = async () => {
    setError(null);
    setNotice(null);
    setBulkSeeding(true);

    const response = await fetch("/api/admin/users/seed", {
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as
      | { users?: AdminUserRecord[]; error?: string }
      | null;
    setBulkSeeding(false);

    if (!response.ok) {
      setError(payload?.error || "Failed to seed default personas.");
      return;
    }

    setNotice(
      payload?.users?.length
        ? `Seeded ${payload.users.length} default personas.`
        : "Default personas are ready."
    );
    await loadUsers();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-lg border border-rule bg-surface p-5">
        <div className="space-y-2">
          <div>
            <p className="label-meta">Temporary Tool</p>
            <h2 className="text-2xl">Seed Development Users</h2>
          </div>
          <p className="font-sans text-sm text-ink-secondary">
            This page creates local app users keyed by stub-shaped
            `authProviderUserId` values. The input contract matches the future Clerk
            direction: email, name, and role.
          </p>
        </div>

        <div className="mt-4 rounded-md border border-rule-light bg-surface-alt/40 p-4 font-sans text-sm text-ink-secondary">
          <p>
            Today: creates local `User` rows only.
          </p>
          <p className="mt-1">
            Later: this route can be re-pointed to Clerk invites or Clerk user
            creation while keeping the admin workflow and input shape stable.
          </p>
          <p className="mt-1">
            Stored role is future-ready metadata. Actual admin access still comes from
            the active auth session claim.
          </p>
        </div>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Email
            </label>
            <input
              className="input-base w-full"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
                First Name
              </label>
              <input
                className="input-base w-full"
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                placeholder="First name"
              />
            </div>

            <div>
              <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
                Last Name
              </label>
              <input
                className="input-base w-full"
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lastName: event.target.value,
                  }))
                }
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Role
            </label>
            <select
              className="input-base w-full"
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as UserRoleValue,
                }))
              }
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-rule-light bg-surface-alt/30 p-3 font-sans text-xs text-ink-tertiary">
            <p className="label-meta">Stub Identity Preview</p>
            <p className="mt-1 break-all text-sm text-ink-secondary">
              {previewAuthProviderUserId}
            </p>
            <p className="mt-1">
              Future Clerk mapping: this placeholder ID will later be replaced by a
              real Clerk `userId`.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 font-sans text-sm">
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-canvas transition-opacity hover:opacity-85 disabled:opacity-40"
              disabled={submitting || bulkSeeding}
            >
              {submitting ? "Seeding…" : "Create Stub User"}
            </button>
            <button
              type="button"
              className="rounded-md border border-rule px-4 py-2 text-ink-secondary transition-colors hover:bg-surface-alt disabled:opacity-40"
              onClick={() => void onSeedDefaults()}
              disabled={submitting || bulkSeeding}
            >
              {bulkSeeding ? "Seeding Defaults…" : "Seed Default Personas"}
            </button>
          </div>

          {(error || notice) && (
            <p
              className={`font-sans text-sm ${
                error ? "text-danger" : "text-ink-secondary"
              }`}
            >
              {error || notice}
            </p>
          )}
        </form>
      </section>

      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Seeded Users</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Current local users, including any rows auto-created by the auth helpers
          during chat or admin requests.
        </p>

        <div className="mt-5 space-y-3">
          {loading && (
            <p className="font-sans text-sm text-ink-tertiary">Loading users…</p>
          )}
          {!loading && users.length === 0 && (
            <p className="font-sans text-sm text-ink-tertiary">
              No local users yet.
            </p>
          )}
          {users.map((user) => (
            <article
              key={user.id}
              className="rounded-md border border-rule-light p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-sans text-sm font-medium">
                    {user.displayName || user.email || user.authProviderUserId}
                  </h3>
                  <p className="mt-0.5 font-sans text-xs text-ink-tertiary">
                    {user.email || "No email"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 font-sans text-[11px]">
                  <span className="rounded-full bg-surface-alt px-2 py-1 text-ink-secondary">
                    {user.role}
                  </span>
                  <span className="rounded-full bg-surface-alt px-2 py-1 text-ink-secondary">
                    {user.providerSource}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-rule-light bg-surface-alt/20 p-3">
                  <p className="label-meta">Auth Provider User Id</p>
                  <p className="mt-1 break-all font-sans text-sm text-ink-secondary">
                    {user.authProviderUserId}
                  </p>
                </div>
                <div className="rounded-md border border-rule-light bg-surface-alt/20 p-3">
                  <p className="label-meta">Thread Count</p>
                  <p className="mt-1 font-sans text-2xl font-light tracking-tight">
                    {user.threadCount}
                  </p>
                </div>
              </div>

              <p className="mt-3 font-sans text-xs text-ink-tertiary">
                Updated {formatTimestamp(user.updatedAt)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
