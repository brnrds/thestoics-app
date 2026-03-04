"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function AdminBlockedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = useMemo(
    () => searchParams.get("redirect") || "/admin",
    [searchParams]
  );

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, redirectPath }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Failed to authorize admin session.");
      return;
    }

    router.push(redirectPath);
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-[75vh] w-full max-w-xl items-center px-6 py-10">
      <section className="w-full rounded-lg border border-rule bg-surface p-6">
        <p className="label-meta">Admin Access Required</p>
        <h2 className="mt-2 text-3xl">Stub Auth Blocked</h2>
        <p className="mt-2 font-sans text-sm text-ink-secondary">
          This route is protected by ADMIN_STUB_TOKEN until Clerk integration is
          added.
        </p>
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Admin token
            </label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              className="input-base w-full"
              placeholder="Enter stub token"
              required
            />
          </div>
          <button
            className="rounded-md bg-ink px-4 py-2 font-sans text-sm font-medium text-canvas transition-opacity hover:opacity-85 disabled:opacity-40"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Checking…" : "Unlock Admin"}
          </button>
        </form>
        {error && (
          <p className="mt-3 font-sans text-sm text-danger">{error}</p>
        )}
      </section>
    </div>
  );
}

function Fallback() {
  return (
    <div className="mx-auto flex min-h-[75vh] w-full max-w-xl items-center px-6 py-10">
      <section className="w-full rounded-lg border border-rule bg-surface p-6">
        <p className="font-sans text-sm text-ink-tertiary">
          Loading admin access screen…
        </p>
      </section>
    </div>
  );
}

export default function AdminBlockedPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AdminBlockedContent />
    </Suspense>
  );
}
