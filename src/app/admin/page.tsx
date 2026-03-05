import Link from "next/link";
import { db } from "@/lib/db";
import { ModeCompositionChart } from "@/components/viz/ModeCompositionChart";
import { AdminPromptsSection } from "@/components/admin/AdminPromptsSection";
import { AdminSkillsSection } from "@/components/admin/AdminSkillsSection";
import { AdminModesSection } from "@/components/admin/AdminModesSection";

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

  const stats = [
    { label: "Modes", value: modeCount, sub: `${activeModes} active` },
    { label: "Prompts", value: promptCount },
    { label: "Skills", value: skillCount },
  ];

  return (
    <div className="space-y-12 pb-10">
      <section id="overview" className="scroll-mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl">System Status</h2>
            <p className="mt-1 font-sans text-sm text-ink-secondary">
              Configure prompts and skills per mode, then run parallel experiments
              in chat.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-rule bg-surface p-4"
              >
                <p className="label-meta">{stat.label}</p>
                <p className="mt-1 font-sans text-3xl font-light tracking-tight">
                  {stat.value}
                </p>
                {stat.sub && (
                  <p className="mt-0.5 font-sans text-xs text-ink-tertiary">
                    {stat.sub}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1 rounded-lg border border-rule-light bg-surface-alt/50 p-4 font-sans text-sm">
            <p>
              <span className="text-ink-secondary">Default Mode:</span>{" "}
              {defaultMode?.name ?? "None"}
            </p>
            <p>
              <span className="text-ink-secondary">Threads:</span> {threadCount}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 font-sans text-sm">
            <Link
              href="/admin/rag-sources"
              className="rounded-md bg-ink px-4 py-2 text-canvas transition-opacity hover:opacity-85"
            >
              Open RAG Sources
            </Link>
          </div>
        </div>

        <ModeCompositionChart
          data={[
            { label: "Prompts", value: promptCount || 1 },
            { label: "Skills", value: skillCount || 1 },
            { label: "Active Modes", value: activeModes || 1 },
          ]}
        />
      </section>

      <section id="prompts" className="scroll-mt-6 space-y-4">
        <div>
          <p className="label-meta">Section</p>
          <h2 className="text-2xl">Prompts</h2>
        </div>
        <AdminPromptsSection />
      </section>

      <section id="skills" className="scroll-mt-6 space-y-4">
        <div>
          <p className="label-meta">Section</p>
          <h2 className="text-2xl">Skills</h2>
        </div>
        <AdminSkillsSection />
      </section>

      <section id="modes" className="scroll-mt-6 space-y-4">
        <div>
          <p className="label-meta">Section</p>
          <h2 className="text-2xl">Modes</h2>
        </div>
        <AdminModesSection />
      </section>
    </div>
  );
}
