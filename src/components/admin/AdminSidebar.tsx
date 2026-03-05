"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const sectionAnchors = [
  { hash: "overview", label: "Overview" },
  { hash: "prompts", label: "Prompts" },
  { hash: "skills", label: "Skills" },
  { hash: "modes", label: "Modes" },
] as const;

const subpages = [
  { href: "/admin/rag-sources", label: "RAG Sources" },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const isAdminHome = pathname === "/admin";
  const [activeHash, setActiveHash] = useState("overview");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!isAdminHome) return;

    const ids = sectionAnchors.map((s) => s.hash);
    const visibleRatios = new Map<string, number>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleRatios.set(entry.target.id, entry.intersectionRatio);
        }
        let best = ids[0];
        let bestRatio = 0;
        for (const id of ids) {
          const ratio = visibleRatios.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        }
        setActiveHash(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [isAdminHome]);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-rule bg-surface">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-xl tracking-normal">Admin</h1>
        <p className="mt-0.5 font-sans text-xs text-ink-tertiary">
          Confer with the Stoics
        </p>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3 font-sans text-sm">
        {/* Section anchors (same-page) */}
        <p className="label-meta mb-1.5 px-2">Sections</p>
        <div className="relative space-y-0.5 pl-3">
          {/* Vertical track line */}
          <div className="absolute top-0 bottom-0 left-[0.4375rem] w-px bg-rule" />

          {sectionAnchors.map((item) => {
            const isActive = isAdminHome && activeHash === item.hash;
            return (
              <Link
                key={item.hash}
                href={`/admin#${item.hash}`}
                className={`relative flex items-center rounded-md px-3 py-1.5 transition-colors ${
                  isActive
                    ? "bg-accent-wash/70 text-accent font-medium"
                    : "text-ink-secondary hover:bg-surface-alt hover:text-ink"
                }`}
              >
                {/* Dot on the track line */}
                <span
                  className={`absolute -left-[0.1875rem] h-[7px] w-[7px] rounded-full border-2 transition-colors ${
                    isActive
                      ? "border-accent bg-accent"
                      : "border-rule bg-surface"
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Subpages (separate routes) */}
        <p className="label-meta mt-5 mb-1.5 px-2">Tools</p>
        {subpages.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                isActive
                  ? "bg-accent-wash/70 text-accent font-medium"
                  : "text-ink-secondary hover:bg-surface-alt hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Back to chat — visually separated at bottom */}
      <div className="border-t border-rule px-3 py-3">
        <Link
          href="/chat"
          className="flex items-center gap-2 rounded-md px-3 py-2 font-sans text-sm text-ink-secondary transition-colors hover:bg-surface-alt hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Chat
        </Link>
      </div>
    </aside>
  );
}
