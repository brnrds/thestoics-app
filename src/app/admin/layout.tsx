import Link from "next/link";

const navItems = [
  { href: "/chat", label: "Chat" },
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/prompts", label: "Prompts" },
  { href: "/admin/skills", label: "Skills" },
  { href: "/admin/modes", label: "Modes" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl tracking-normal">Admin</h1>
            <p className="font-sans text-xs text-ink-tertiary">
              Confer with the Stoics
            </p>
          </div>
          <nav className="flex gap-1 font-sans text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-ink-secondary transition-colors hover:bg-surface-alt hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
