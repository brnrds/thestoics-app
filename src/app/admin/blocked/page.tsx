"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function AdminBlockedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = useMemo(() => searchParams.get("redirect") || "/admin", [searchParams]);

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
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Failed to authorize admin session.");
      return;
    }

    router.push(redirectPath);
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-[75vh] w-full max-w-xl items-center px-4 py-10">
      <section className="card-surface w-full p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-clay-700)]">Admin Access Required</p>
        <h2 className="mt-2 text-3xl font-semibold">Stub Auth Blocked</h2>
        <p className="mt-2 text-sm text-[var(--color-clay-700)]">
          This route is protected by `ADMIN_STUB_TOKEN` until Clerk integration is added.
        </p>
        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">Admin token</label>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            className="input-base w-full"
            placeholder="Enter stub token"
            required
          />
          <button
            className="rounded-full bg-[var(--color-ink-900)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Checking..." : "Unlock Admin"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}

function Fallback() {
  return (
    <div className="mx-auto flex min-h-[75vh] w-full max-w-xl items-center px-4 py-10">
      <section className="card-surface w-full p-6">
        <p className="text-sm text-[var(--color-clay-700)]">Loading admin access screen...</p>
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
