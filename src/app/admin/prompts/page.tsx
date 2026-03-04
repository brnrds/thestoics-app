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
    const data = (await res.json()) as {
      prompts: PromptRecord[];
      error?: string;
    };
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
    const endpoint = form.id
      ? `/api/admin/prompts/${form.id}`
      : "/api/admin/prompts";
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
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
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
    if (!window.confirm("Delete this prompt?")) return;
    const res = await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Failed to delete prompt.");
      return;
    }
    await loadPrompts();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Prompt Editor</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Role-based prompt templates for mode assembly.
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Name
            </label>
            <input
              className="input-base w-full"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Prompt name"
              required
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Role
            </label>
            <select
              className="input-base w-full"
              value={form.role}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  role: e.target.value as PromptRole,
                }))
              }
            >
              <option value="SYSTEM">SYSTEM</option>
              <option value="STYLE">STYLE</option>
              <option value="SAFETY">SAFETY</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Content
            </label>
            <textarea
              className="input-base min-h-36 w-full"
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              placeholder="Prompt text"
              required
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1 font-sans text-sm">
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-canvas transition-opacity hover:opacity-85 disabled:opacity-40"
              disabled={submitting}
            >
              {submitting
                ? "Saving…"
                : form.id
                  ? "Update Prompt"
                  : "Create Prompt"}
            </button>
            {form.id && (
              <button
                type="button"
                className="rounded-md border border-rule px-4 py-2 text-ink-secondary transition-colors hover:bg-surface-alt"
                onClick={() => setForm(initialForm)}
              >
                Cancel
              </button>
            )}
          </div>
          {error && (
            <p className="font-sans text-sm text-danger">{error}</p>
          )}
        </form>
      </section>

      {/* ── Library ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Prompt Library</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Edits persist immediately for mode assignment.
        </p>

        <div className="mt-5 space-y-3">
          {loading && (
            <p className="font-sans text-sm text-ink-tertiary">
              Loading prompts…
            </p>
          )}
          {!loading && prompts.length === 0 && (
            <p className="font-sans text-sm text-ink-tertiary">
              No prompts yet.
            </p>
          )}
          {prompts.map((prompt) => (
            <article
              key={prompt.id}
              className="rounded-md border border-rule-light p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-sans text-sm font-medium">{prompt.name}</h3>
                  <p className="label-meta mt-0.5">{prompt.role}</p>
                </div>
                <div className="flex gap-2 font-sans text-xs">
                  <button
                    className="rounded px-2 py-1 text-ink-secondary transition-colors hover:bg-surface-alt"
                    onClick={() => onEdit(prompt)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded px-2 py-1 text-danger transition-colors hover:bg-danger-wash"
                    onClick={() => onDelete(prompt.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-secondary">
                {prompt.content}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
