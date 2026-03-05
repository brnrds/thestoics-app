"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  InteractionModeRecord,
  PromptRecord,
  SkillRecord,
} from "@/lib/contracts";

type ModeForm = {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  isDefault: boolean;
  promptIds: string[];
  skillIds: string[];
};

const initialForm: ModeForm = {
  id: null,
  name: "",
  slug: "",
  description: "",
  active: true,
  isDefault: false,
  promptIds: [],
  skillIds: [],
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function AdminModesSection() {
  const [modes, setModes] = useState<InteractionModeRecord[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [form, setForm] = useState<ModeForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptLookup = useMemo(
    () => new Map(prompts.map((p) => [p.id, p])),
    [prompts]
  );
  const skillLookup = useMemo(
    () => new Map(skills.map((s) => [s.id, s])),
    [skills]
  );

  const loadAll = async () => {
    setLoading(true);
    const [modeRes, promptRes, skillRes] = await Promise.all([
      fetch("/api/admin/modes", { cache: "no-store" }),
      fetch("/api/admin/prompts", { cache: "no-store" }),
      fetch("/api/admin/skills", { cache: "no-store" }),
    ]);
    const [modeData, promptData, skillData] = (await Promise.all([
      modeRes.json(),
      promptRes.json(),
      skillRes.json(),
    ])) as [
      { modes?: InteractionModeRecord[]; error?: string },
      { prompts?: PromptRecord[]; error?: string },
      { skills?: SkillRecord[]; error?: string },
    ];
    if (!modeRes.ok || !promptRes.ok || !skillRes.ok) {
      setError(
        modeData.error ||
          promptData.error ||
          skillData.error ||
          "Failed to load mode management data."
      );
      setLoading(false);
      return;
    }
    setModes(modeData.modes || []);
    setPrompts(promptData.prompts || []);
    setSkills(skillData.skills || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const slug = slugify(form.slug || form.name);
    if (!form.name.trim() || !slug || !form.description.trim()) {
      setError("Name, slug, and description are required.");
      return;
    }
    setSubmitting(true);
    const endpoint = form.id ? `/api/admin/modes/${form.id}` : "/api/admin/modes";
    const method = form.id ? "PUT" : "POST";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        slug,
        description: form.description,
        active: form.active,
        isDefault: form.isDefault,
        promptIds: form.promptIds,
        skillIds: form.skillIds,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error || "Failed to save interaction mode.");
      return;
    }
    setForm(initialForm);
    await loadAll();
  };

  const onDelete = async (id: string) => {
    if (
      !window.confirm(
        "Delete this mode? Existing threads keep their stored snapshot."
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/modes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Failed to delete mode.");
      return;
    }
    await loadAll();
  };

  const onEdit = (mode: InteractionModeRecord) => {
    setForm({
      id: mode.id,
      name: mode.name,
      slug: mode.slug,
      description: mode.description,
      active: mode.active,
      isDefault: mode.isDefault,
      promptIds: mode.prompts.map((p) => p.id),
      skillIds: mode.skills.map((s) => s.id),
    });
  };

  const toggleSelection = (value: string, field: "promptIds" | "skillIds") => {
    setForm((prev) => {
      const set = new Set(prev[field]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [field]: Array.from(set) };
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Mode Editor</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Attach prompts and skills. RAG is always enabled at runtime.
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
                setForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                  slug: prev.id ? prev.slug : slugify(e.target.value),
                }))
              }
              placeholder="Mode name"
              required
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Slug
            </label>
            <input
              className="input-base w-full"
              value={form.slug}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  slug: slugify(e.target.value),
                }))
              }
              placeholder="mode-slug"
              required
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Description
            </label>
            <textarea
              className="input-base min-h-24 w-full"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Describe this mode"
              required
            />
          </div>

          <div className="grid gap-3 font-sans text-sm sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, active: e.target.checked }))
                }
                className="accent-accent"
              />
              Active
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    isDefault: e.target.checked,
                  }))
                }
                className="accent-accent"
              />
              Default for New Threads
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="rounded-md border border-rule-light bg-surface-alt/30 p-3">
              <legend className="px-1 font-sans text-xs font-medium text-ink-secondary">
                Prompts
              </legend>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto font-sans text-sm">
                {prompts.map((prompt) => (
                  <label key={prompt.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={form.promptIds.includes(prompt.id)}
                      onChange={() => toggleSelection(prompt.id, "promptIds")}
                      className="mt-0.5 accent-accent"
                    />
                    <span>{prompt.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-md border border-rule-light bg-surface-alt/30 p-3">
              <legend className="px-1 font-sans text-xs font-medium text-ink-secondary">
                Skills
              </legend>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto font-sans text-sm">
                {skills.map((skill) => (
                  <label key={skill.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={form.skillIds.includes(skill.id)}
                      onChange={() => toggleSelection(skill.id, "skillIds")}
                      className="mt-0.5 accent-accent"
                    />
                    <span>{skill.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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
                  ? "Update Mode"
                  : "Create Mode"}
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
          {error && <p className="font-sans text-sm text-danger">{error}</p>}
        </form>
      </section>

      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Configured Modes</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Threads store a mode snapshot so deactivated modes don&apos;t break
          history.
        </p>

        <div className="mt-5 space-y-3">
          {loading && (
            <p className="font-sans text-sm text-ink-tertiary">Loading modes…</p>
          )}
          {!loading && modes.length === 0 && (
            <p className="font-sans text-sm text-ink-tertiary">
              No modes configured.
            </p>
          )}
          {modes.map((mode) => (
            <article
              key={mode.id}
              className="rounded-md border border-rule-light p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-sans text-sm font-medium">{mode.name}</h3>
                  <p className="label-meta mt-0.5">{mode.slug}</p>
                </div>
                <div className="flex gap-2 font-sans text-xs">
                  <button
                    className="rounded px-2 py-1 text-ink-secondary transition-colors hover:bg-surface-alt"
                    onClick={() => onEdit(mode)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded px-2 py-1 text-danger transition-colors hover:bg-danger-wash"
                    onClick={() => onDelete(mode.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <p className="mt-2 font-sans text-sm text-ink-secondary">
                {mode.description}
              </p>
              <p className="mt-2 font-sans text-xs text-ink-tertiary">
                {mode.active ? "Active" : "Inactive"}
                {mode.isDefault ? " · Default" : ""}
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="label-meta">Prompts</p>
                  <ul className="mt-1 font-sans text-sm">
                    {mode.prompts.length === 0 && (
                      <li className="text-ink-tertiary">None</li>
                    )}
                    {mode.prompts
                      .sort((a, b) => a.order - b.order)
                      .map((p) => (
                        <li key={p.id}>
                          {promptLookup.get(p.id)?.name ?? p.name}
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <p className="label-meta">Skills</p>
                  <ul className="mt-1 font-sans text-sm">
                    {mode.skills.length === 0 && (
                      <li className="text-ink-tertiary">None</li>
                    )}
                    {mode.skills
                      .sort((a, b) => a.order - b.order)
                      .map((s) => (
                        <li key={s.id}>{skillLookup.get(s.id)?.name ?? s.name}</li>
                      ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
