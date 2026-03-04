"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PromptRole } from "@prisma/client";
import type { PromptRecord } from "@/lib/contracts";

type PromptForm = {
  id: string | null;
  name: string;
  role: PromptRole;
  content: string;
};

const initialForm: PromptForm = {
  id: null,
  name: "",
  role: "SYSTEM",
  content: "",
};

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [form, setForm] = useState<PromptForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrompts = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/prompts", { cache: "no-store" });
    const data = (await res.json()) as { prompts: PromptRecord[]; error?: string };
    if (!res.ok) {
      setError(data.error || "Failed to load prompts.");
      setLoading(false);
      return;
    }

    setPrompts(data.prompts);
    setLoading(false);
  };

  useEffect(() => {
    void loadPrompts();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.content.trim()) {
      setError("Prompt name and content are required.");
      return;
    }

    setSubmitting(true);
    const endpoint = form.id ? `/api/admin/prompts/${form.id}` : "/api/admin/prompts";
    const method = form.id ? "PUT" : "POST";

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        role: form.role,
        content: form.content,
      }),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;

    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error || "Failed to save prompt.");
      return;
    }

    setForm(initialForm);
    await loadPrompts();
  };

  const onEdit = (prompt: PromptRecord) => {
    setForm({
      id: prompt.id,
      name: prompt.name,
      role: prompt.role,
      content: prompt.content,
    });
  };

  const onDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this prompt?");
    if (!confirmed) {
      return;
    }

    const res = await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Failed to delete prompt.");
      return;
    }

    await loadPrompts();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
      <section className="card-surface p-5">
        <h2 className="text-2xl font-semibold">Prompt Editor</h2>
        <p className="mt-1 text-sm text-[var(--color-clay-700)]">Create role-based prompt templates for interaction mode assembly.</p>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">Name</label>
          <input
            className="input-base w-full"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Prompt name"
            required
          />

          <label className="block text-sm font-medium">Role / Type</label>
          <select
            className="input-base w-full"
            value={form.role}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                role: event.target.value as PromptRole,
              }))
            }
          >
            <option value="SYSTEM">SYSTEM</option>
            <option value="STYLE">STYLE</option>
            <option value="SAFETY">SAFETY</option>
          </select>

          <label className="block text-sm font-medium">Content</label>
          <textarea
            className="input-base min-h-36 w-full"
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="Prompt text"
            required
          />

          <div className="flex flex-wrap gap-2 pt-1 text-sm">
            <button
              type="submit"
              className="rounded-full bg-[var(--color-olive-500)] px-4 py-2 text-white disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Saving..." : form.id ? "Update Prompt" : "Create Prompt"}
            </button>
            {form.id ? (
              <button
                type="button"
                className="rounded-full border border-[var(--color-clay-700)]/50 px-4 py-2"
                onClick={() => setForm(initialForm)}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      </section>

      <section className="card-surface p-5">
        <h2 className="text-2xl font-semibold">Prompt Library</h2>
        <p className="mt-1 text-sm text-[var(--color-clay-700)]">Edits persist immediately and are available for mode assignment.</p>
        <div className="mt-4 space-y-3">
          {loading ? <p className="text-sm">Loading prompts...</p> : null}
          {!loading && prompts.length === 0 ? <p className="text-sm">No prompts yet.</p> : null}
          {prompts.map((prompt) => (
            <article key={prompt.id} className="rounded-xl border border-[var(--color-clay-700)]/28 bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{prompt.name}</h3>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-clay-700)]">{prompt.role}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="rounded-full border px-3 py-1" onClick={() => onEdit(prompt)}>Edit</button>
                  <button className="rounded-full border border-red-700 px-3 py-1 text-red-700" onClick={() => onDelete(prompt.id)}>Delete</button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-clay-700)]">{prompt.content}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
