"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/assets", label: "Assets" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-surface sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground text-sm font-semibold">
            B
          </span>
          <span className="font-semibold tracking-tight">Backoffice</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  active
                    ? "bg-foreground/5 dark:bg-foreground/10 text-foreground"
                    : "text-foreground-muted hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/tasks/new"
          className="text-sm px-3 py-1.5 rounded-md bg-accent text-accent-foreground hover:opacity-90"
        >
          New task
        </Link>
      </div>
    </header>
  );
}
