import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { href: "/chat", label: "Chat" },
  { href: "/admin#overview", label: "Overview" },
  { href: "/admin#prompts", label: "Prompts" },
  { href: "/admin#skills", label: "Skills" },
  { href: "/admin#modes", label: "Modes" },
  { href: "/admin/rag-sources", label: "RAG Sources" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-rule">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-xl tracking-normal">Admin</h1>
          <p className="mt-0.5 font-sans text-xs text-ink-tertiary">
            Confer with the Stoics
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 font-sans text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-ink-secondary transition-colors hover:bg-surface-alt hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="absolute top-4 right-6 z-10">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-5xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
