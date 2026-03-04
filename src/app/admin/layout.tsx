import Link from "next/link";

const navItems = [
  { href: "/chat", label: "Chat Workspace" },
  { href: "/admin", label: "Admin Home" },
  { href: "/admin/prompts", label: "Prompts" },
  { href: "/admin/skills", label: "Skills" },
  { href: "/admin/modes", label: "Interaction Modes" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-8">
      <header className="card-surface mb-6 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-clay-700)]">Confer with the Stoics</p>
          <h1 className="text-3xl font-semibold text-[var(--color-ink-900)]">Admin Console</h1>
          <p className="text-sm text-[var(--color-clay-700)]">Manage prompts, skills, and mode behavior for internal beta testing.</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-[color:var(--color-clay-700)]/35 bg-white/75 px-3 py-1.5 hover:bg-[var(--color-sand-100)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
