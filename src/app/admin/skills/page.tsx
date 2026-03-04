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
    const data = (await res.json()) as { skills: SkillRecord[]; error?: string };

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
    const endpoint = form.id ? `/api/admin/skills/${form.id}` : "/api/admin/skills";
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

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
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
    const confirmed = window.confirm("Delete this skill?");
    if (!confirmed) {
      return;
    }

    const res = await fetch(`/api/admin/skills/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Failed to delete skill.");
      return;
    }

    await loadSkills();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
      <section className="card-surface p-5">
        <h2 className="text-2xl font-semibold">Skill Editor</h2>
        <p className="mt-1 text-sm text-[var(--color-clay-700)]">Define behavioral constraints and reasoning instructions reusable across modes.</p>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">Name</label>
          <input
            className="input-base w-full"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Skill name"
            required
          />

          <label className="block text-sm font-medium">Description</label>
          <input
            className="input-base w-full"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Short description"
            required
          />

          <label className="block text-sm font-medium">Instruction Body</label>
          <textarea
            className="input-base min-h-36 w-full"
            value={form.body}
            onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            placeholder="Instruction text"
            required
          />

          <div className="flex flex-wrap gap-2 pt-1 text-sm">
            <button
              type="submit"
              className="rounded-full bg-[var(--color-rust-500)] px-4 py-2 text-white disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Saving..." : form.id ? "Update Skill" : "Create Skill"}
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
        <h2 className="text-2xl font-semibold">Skill Library</h2>
        <p className="mt-1 text-sm text-[var(--color-clay-700)]">Duplicate names are blocked to keep assignment unambiguous.</p>
        <div className="mt-4 space-y-3">
          {loading ? <p className="text-sm">Loading skills...</p> : null}
          {!loading && skills.length === 0 ? <p className="text-sm">No skills yet.</p> : null}
          {skills.map((skill) => (
            <article key={skill.id} className="rounded-xl border border-[var(--color-clay-700)]/28 bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{skill.name}</h3>
                  <p className="text-sm text-[var(--color-clay-700)]">{skill.description}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="rounded-full border px-3 py-1" onClick={() => onEdit(skill)}>Edit</button>
                  <button className="rounded-full border border-red-700 px-3 py-1 text-red-700" onClick={() => onDelete(skill.id)}>Delete</button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-clay-700)]">{skill.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
