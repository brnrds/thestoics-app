"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SkillRecord } from "@/lib/contracts";

type SkillForm = {
  id: string | null;
  name: string;
  description: string;
  body: string;
};

const initialForm: SkillForm = {
  id: null,
  name: "",
  description: "",
  body: "",
};

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [form, setForm] = useState<SkillForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/skills", { cache: "no-store" });
    const data = (await res.json()) as {
      skills: SkillRecord[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Failed to load skills.");
      setLoading(false);
      return;
    }
    setSkills(data.skills);
    setLoading(false);
  };

  useEffect(() => {
    void loadSkills();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.description.trim() || !form.body.trim()) {
      setError("Name, description, and instruction body are required.");
      return;
    }
    setSubmitting(true);
    const endpoint = form.id
      ? `/api/admin/skills/${form.id}`
      : "/api/admin/skills";
    const method = form.id ? "PUT" : "POST";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        body: form.body,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error || "Failed to save skill.");
      return;
    }
    setForm(initialForm);
    await loadSkills();
  };

  const onEdit = (skill: SkillRecord) => {
    setForm({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      body: skill.body,
    });
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this skill?")) return;
    const res = await fetch(`/api/admin/skills/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Failed to delete skill.");
      return;
    }
    await loadSkills();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-2xl">Skill Editor</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Behavioral constraints and reasoning instructions reusable across
          modes.
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
              placeholder="Skill name"
              required
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Description
            </label>
            <input
              className="input-base w-full"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Short description"
              required
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-xs font-medium text-ink-secondary">
              Instruction Body
            </label>
            <textarea
              className="input-base min-h-36 w-full"
              value={form.body}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, body: e.target.value }))
              }
              placeholder="Instruction text"
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
                  ? "Update Skill"
                  : "Create Skill"}
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
        <h2 className="text-2xl">Skill Library</h2>
        <p className="mt-1 font-sans text-sm text-ink-secondary">
          Duplicate names are blocked to keep assignment unambiguous.
        </p>

        <div className="mt-5 space-y-3">
          {loading && (
            <p className="font-sans text-sm text-ink-tertiary">
              Loading skills…
            </p>
          )}
          {!loading && skills.length === 0 && (
            <p className="font-sans text-sm text-ink-tertiary">
              No skills yet.
            </p>
          )}
          {skills.map((skill) => (
            <article
              key={skill.id}
              className="rounded-md border border-rule-light p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-sans text-sm font-medium">{skill.name}</h3>
                  <p className="mt-0.5 font-sans text-xs text-ink-tertiary">
                    {skill.description}
                  </p>
                </div>
                <div className="flex gap-2 font-sans text-xs">
                  <button
                    className="rounded px-2 py-1 text-ink-secondary transition-colors hover:bg-surface-alt"
                    onClick={() => onEdit(skill)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded px-2 py-1 text-danger transition-colors hover:bg-danger-wash"
                    onClick={() => onDelete(skill.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-secondary">
                {skill.body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
