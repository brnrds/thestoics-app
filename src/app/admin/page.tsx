import Link from "next/link";
import { db } from "@/lib/db";
import { ModeCompositionChart } from "@/components/viz/ModeCompositionChart";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [promptCount, skillCount, modeCount, activeModes, defaultMode, threadCount] =
    await Promise.all([
      db.prompt.count(),
      db.skill.count(),
      db.interactionMode.count(),
      db.interactionMode.count({ where: { active: true } }),
      db.interactionMode.findFirst({ where: { isDefault: true } }),
      db.conversationThread.count(),
    ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <section className="card-surface space-y-4 p-5">
        <h2 className="text-2xl font-semibold">Internal Beta Status</h2>
        <p className="text-sm text-[var(--color-clay-700)]">
          Shared RAG is always enabled in runtime. Configure prompts and skills per interaction mode, then run parallel thread experiments in the chat workspace.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-clay-700)]">Modes</p>
            <p className="text-3xl font-semibold">{modeCount}</p>
            <p className="text-xs text-[var(--color-clay-700)]">{activeModes} active</p>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-clay-700)]">Prompts</p>
            <p className="text-3xl font-semibold">{promptCount}</p>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-clay-700)]">Skills</p>
            <p className="text-3xl font-semibold">{skillCount}</p>
          </div>
        </div>
        <div className="rounded-xl bg-[var(--color-sand-100)]/70 p-3 text-sm">
          <p>
            <strong>Default Mode:</strong> {defaultMode?.name ?? "None configured"}
          </p>
          <p>
            <strong>Threads:</strong> {threadCount}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/prompts" className="rounded-full bg-[var(--color-olive-500)] px-4 py-2 text-white hover:brightness-95">
            Manage Prompts
          </Link>
          <Link href="/admin/skills" className="rounded-full bg-[var(--color-rust-500)] px-4 py-2 text-white hover:brightness-95">
            Manage Skills
          </Link>
          <Link href="/admin/modes" className="rounded-full border border-[var(--color-clay-700)]/45 px-4 py-2 hover:bg-[var(--color-sand-100)]">
            Manage Modes
          </Link>
        </div>
      </section>
      <ModeCompositionChart
        data={[
          { label: "Prompts", value: promptCount || 1 },
          { label: "Skills", value: skillCount || 1 },
          { label: "Active Modes", value: activeModes || 1 },
        ]}
      />
    </div>
  );
}
