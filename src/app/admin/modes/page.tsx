"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { InteractionModeRecord, PromptRecord, SkillRecord } from "@/lib/contracts";

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

export default function AdminModesPage() {
  const [modes, setModes] = useState<InteractionModeRecord[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [form, setForm] = useState<ModeForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptLookup = useMemo(() => new Map(prompts.map((prompt) => [prompt.id, prompt])), [prompts]);
  const skillLookup = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);

  const loadAll = async () => {
    setLoading(true);

    const [modeRes, promptRes, skillRes] = await Promise.all([
      fetch("/api/admin/modes", { cache: "no-store" }),
      fetch("/api/admin/prompts", { cache: "no-store" }),
      fetch("/api/admin/skills", { cache: "no-store" }),
    ]);

    const [modeData, promptData, skillData] = await Promise.all([
      modeRes.json(),
      promptRes.json(),
      skillRes.json(),
    ]) as [
      { modes?: InteractionModeRecord[]; error?: string },
      { prompts?: PromptRecord[]; error?: string },
      { skills?: SkillRecord[]; error?: string }
    ];

    if (!modeRes.ok || !promptRes.ok || !skillRes.ok) {
      setError(modeData.error || promptData.error || skillData.error || "Failed to load mode management data.");
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

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error || "Failed to save interaction mode.");
      return;
    }

    setForm(initialForm);
    await loadAll();
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this mode? Existing threads keep their stored snapshot.")) {
      return;
    }

    const res = await fetch(`/api/admin/modes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
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
      promptIds: mode.prompts.map((prompt) => prompt.id),
      skillIds: mode.skills.map((skill) => skill.id),
    });
  };

  const toggleSelection = (value: string, field: "promptIds" | "skillIds") => {
    setForm((previous) => {
      const set = new Set(previous[field]);
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      return {
        ...previous,
        [field]: Array.from(set),
      };
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
      <section className="card-surface p-5">
        <h2 className="text-2xl font-semibold">Interaction Mode Editor</h2>
        <p className="mt-1 text-sm text-[var(--color-clay-700)]">Attach multiple prompts and skills. Shared RAG behavior is always enabled at runtime.</p>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">Name</label>
          <input
            className="input-base w-full"
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                name: event.target.value,
                slug: prev.id ? prev.slug : slugify(event.target.value),
              }))
            }
            placeholder="Mode name"
            required
          />

          <label className="block text-sm font-medium">Slug</label>
          <input
            className="input-base w-full"
            value={form.slug}
            onChange={(event) => setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
            placeholder="mode-slug"
            required
          />

          <label className="block text-sm font-medium">Description</label>
          <textarea
            className="input-base min-h-24 w-full"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Describe this mode"
            required
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
              />
              Default for New Threads
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="rounded-xl border border-[var(--color-clay-700)]/26 bg-white/70 p-3">
              <legend className="px-1 text-sm font-semibold">Prompts</legend>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
                {prompts.map((prompt) => (
                  <label key={prompt.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={form.promptIds.includes(prompt.id)}
                      onChange={() => toggleSelection(prompt.id, "promptIds")}
                    />
                    <span>{prompt.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-[var(--color-clay-700)]/26 bg-white/70 p-3">
              <legend className="px-1 text-sm font-semibold">Skills</legend>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
                {skills.map((skill) => (
                  <label key={skill.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={form.skillIds.includes(skill.id)}
                      onChange={() => toggleSelection(skill.id, "skillIds")}
                    />
                    <span>{skill.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 text-sm">
            <button
              type="submit"
              className="rounded-full bg-[var(--color-ink-900)] px-4 py-2 text-white disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Saving..." : form.id ? "Update Mode" : "Create Mode"}
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
        <h2 className="text-2xl font-semibold">Configured Modes</h2>
        <p className="mt-1 text-sm text-[var(--color-clay-700)]">Each thread stores a mode snapshot so deactivated modes do not break historical conversations.</p>
        <div className="mt-4 space-y-3">
          {loading ? <p className="text-sm">Loading modes...</p> : null}
          {!loading && modes.length === 0 ? <p className="text-sm">No modes configured.</p> : null}
          {modes.map((mode) => (
            <article key={mode.id} className="rounded-xl border border-[var(--color-clay-700)]/28 bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{mode.name}</h3>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-clay-700)]">{mode.slug}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="rounded-full border px-3 py-1" onClick={() => onEdit(mode)}>Edit</button>
                  <button className="rounded-full border border-red-700 px-3 py-1 text-red-700" onClick={() => onDelete(mode.id)}>Delete</button>
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--color-clay-700)]">{mode.description}</p>
              <p className="mt-2 text-xs text-[var(--color-clay-700)]">
                {mode.active ? "Active" : "Inactive"} {mode.isDefault ? "• Default" : ""} • Shared RAG enabled
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-clay-700)]">Prompts</p>
                  <ul className="text-sm">
                    {mode.prompts.length === 0 ? <li className="text-[var(--color-clay-700)]">None</li> : null}
                    {mode.prompts
                      .sort((a, b) => a.order - b.order)
                      .map((prompt) => (
                        <li key={prompt.id}>{promptLookup.get(prompt.id)?.name ?? prompt.name}</li>
                      ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-clay-700)]">Skills</p>
                  <ul className="text-sm">
                    {mode.skills.length === 0 ? <li className="text-[var(--color-clay-700)]">None</li> : null}
                    {mode.skills
                      .sort((a, b) => a.order - b.order)
                      .map((skill) => (
                        <li key={skill.id}>{skillLookup.get(skill.id)?.name ?? skill.name}</li>
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
