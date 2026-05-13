"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { behaviorList } from "@/lib/behaviors";

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  // Optional small trailing slot — chip, dot, count.
  trailing?: ReactNode;
  // Optional CSS color used for an accent dot before the label.
  accent?: string;
  // When true, the item is rendered as a sub-item under the preceding one
  // (indented, no icon, just a connector + label).
  child?: boolean;
  // When true, the item is active only on an exact pathname match (not a
  // prefix match). Use for "index" links like /automations.
  exact?: boolean;
};

type Section = { title: string; items: Item[] };

function dot(color: string) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

const sections: Section[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Automations",
    items: [
      {
        href: "/automations",
        label: "All behaviors",
        exact: true,
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        ),
      },
      ...behaviorList.flatMap<Item>((b) => {
        const head: Item = {
          href: b.href,
          label: b.name,
          accent: b.accent,
          icon: (
            <span
              className="flex h-full w-full items-center justify-center"
              style={{ color: b.accent }}
            >
              {b.icon}
            </span>
          ),
          trailing:
            b.status === "coming-soon" ? (
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted/80 px-1.5 py-0.5 rounded border border-border">
                Soon
              </span>
            ) : null,
        };
        // Crypto Intervals is the only behavior with a sub-resource today
        // (Assets). Nest it visually so it reads as "owned by" crypto rather
        // than a global concept.
        if (b.key === "crypto-interval") {
          return [
            head,
            {
              href: "/automations/crypto-interval/assets",
              label: "Assets",
              accent: b.accent,
              icon: <span />,
              child: true,
            } satisfies Item,
          ];
        }
        return [head];
      }),
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        href: "/markets",
        label: "Markets",
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3h18v4H3zM3 11h18v4H3zM3 19h18v2H3z" />
          </svg>
        ),
      },
      {
        href: "/events",
        label: "Events",
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        ),
      },
    ],
  },
];

function isActive(pathname: string, item: Item) {
  const { href, exact } = item;
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-surface flex-col sticky top-0 h-screen">
      <div className="px-5 h-14 flex items-center gap-2 border-b border-border">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-sm font-bold">
          P
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">
            Prediction
          </span>
          <span className="text-[11px] text-foreground-muted -mt-0.5">
            Backoffice
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
              {s.title}
            </div>
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = isActive(pathname, item);
                if (item.child) {
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`group flex items-center gap-2.5 pl-9 pr-2 py-1 rounded-md text-[13px] transition-colors ${
                          active
                            ? "text-foreground bg-foreground/[0.04]"
                            : "text-foreground-muted hover:text-foreground hover:bg-foreground/[0.03]"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="inline-block h-1 w-1 rounded-full"
                          style={{
                            backgroundColor: active
                              ? item.accent
                              : "var(--border-strong)",
                          }}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.trailing}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-foreground/[0.06] text-foreground"
                          : "text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]"
                      }`}
                    >
                      <span
                        className={`relative h-4 w-4 shrink-0 ${
                          active ? "text-foreground" : ""
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate flex items-center gap-2">
                        {item.accent ? dot(item.accent) : null}
                        {item.label}
                      </span>
                      {item.trailing}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 text-[11px] text-foreground-muted flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          API connected
        </span>
        <span>v0.1</span>
      </div>
    </aside>
  );
}

// Compact top bar used on mobile widths where the sidebar is hidden.
export function MobileBar() {
  const pathname = usePathname();
  const allItems = sections.flatMap((s) => s.items);
  const active = allItems.find((i) => isActive(pathname, i));
  return (
    <header className="lg:hidden sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="px-4 h-14 flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-sm font-bold">
          P
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">
            Prediction
          </span>
          <span className="text-[11px] text-foreground-muted -mt-0.5">
            {active?.label ?? "Backoffice"}
          </span>
        </div>
        <div className="flex-1" />
        <details className="relative">
          <summary className="list-none cursor-pointer px-2 py-1.5 rounded-md border border-border text-sm">
            Menu
          </summary>
          <div className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-lg shadow-lg p-3 space-y-4 z-40">
            {sections.map((s) => (
              <div key={s.title}>
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
                  {s.title}
                </div>
                <ul className="space-y-0.5">
                  {s.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-foreground/5"
                      >
                        <span className="h-4 w-4">{item.icon}</span>
                        <span className="flex items-center gap-2 flex-1">
                          {item.accent ? dot(item.accent) : null}
                          {item.label}
                        </span>
                        {item.trailing}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}
