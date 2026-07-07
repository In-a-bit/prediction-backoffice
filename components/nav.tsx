"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { behaviorList } from "@/lib/behaviors";
import { useMe } from "@/components/auth/permission-context";
import { can, type Permission } from "@/lib/auth";

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  // Permission required to see this item. Undefined = always visible (when authed).
  requires?: Permission;
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
  // Optional React-key override. Use when multiple sibling items share the
  // same href (e.g. several "coming soon" sports all linking to the hub).
  key?: string;
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
    title: "Operations",
    items: [
      {
        href: "/operations",
        label: "Dashboard",
        requires: "markets.read",
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
      {
        href: "/operations/analytics",
        label: "Analytics",
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
        ),
      },
      {
        href: "/operations/alerts",
        label: "Alerts",
        requires: "alerts.read",
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a7 7 0 00-7 7v4l-2 3h18l-2-3V9a7 7 0 00-7-7z" />
            <path d="M9 19a3 3 0 006 0" />
          </svg>
        ),
      },
      {
        href: "/resolutions",
        label: "Resolutions",
        requires: "oracle.read",
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="9" />
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
        requires: "tasks.read",
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
          requires: "tasks.read",
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
        if (b.key === "crypto-interval") {
          return [
            head,
            {
              key: "crypto-tasks",
              href: "/automations/crypto-interval",
              label: "Tasks",
              accent: b.accent,
              requires: "tasks.read",
              icon: <span />,
              child: true,
              exact: true,
            } satisfies Item,
            {
              href: "/automations/crypto-interval/assets",
              label: "Assets",
              accent: b.accent,
              requires: "configs.read",
              icon: <span />,
              child: true,
            } satisfies Item,
            {
              key: "crypto-events-shortcut",
              href: "/deploy-plans?source=crypto",
              label: "Active plans",
              accent: b.accent,
              requires: "plans.read",
              icon: <span />,
              child: true,
            } satisfies Item,
          ];
        }
        if (b.key === "manual") {
          return [
            head,
            { href: "/automations/manual/series/new", label: "New series", accent: b.accent, requires: "markets.create", icon: <span />, child: true } satisfies Item,
            { href: "/automations/manual/events/new", label: "New event", accent: b.accent, requires: "markets.create", icon: <span />, child: true } satisfies Item,
            { href: "/automations/manual/events/from-slug", label: "From Polymarket slug", accent: b.accent, requires: "markets.create", icon: <span />, child: true } satisfies Item,
            { href: "/automations/manual/events/from-description", label: "From description (AI)", accent: b.accent, requires: "markets.create", icon: <span />, child: true } satisfies Item,
          ];
        }
        if (b.key === "sports") {
          const soonChip = (
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted/80">soon</span>
          );
          return [
            head,
            { href: "/automations/sports/soccer", label: "Soccer", accent: b.accent, requires: "tasks.read", icon: <span />, child: true } satisfies Item,
            { key: "soon-basketball", href: "/automations/sports", label: "Basketball (soon)", accent: b.accent, requires: "tasks.read", icon: <span />, child: true, trailing: soonChip } satisfies Item,
            { key: "soon-nba", href: "/automations/sports", label: "NBA (soon)", accent: b.accent, requires: "tasks.read", icon: <span />, child: true, trailing: soonChip } satisfies Item,
            { key: "soon-mma", href: "/automations/sports", label: "MMA (soon)", accent: b.accent, requires: "tasks.read", icon: <span />, child: true, trailing: soonChip } satisfies Item,
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
        requires: "markets.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h18v4H3zM3 11h18v4H3zM3 19h18v2H3z" />
          </svg>
        ),
      },
      {
        href: "/events",
        label: "Events",
        requires: "markets.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        ),
      },
      {
        href: "/deploy-plans",
        label: "Deploy plans",
        requires: "plans.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h10l4 4v10a2 2 0 0 1-2 2H4z" />
            <path d="M14 5v4h4" />
            <path d="M8 13h7M8 17h5" />
          </svg>
        ),
      },
      {
        href: "/operator-log",
        label: "Operator log",
        requires: "markets.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
            <circle cx="20" cy="18" r="2" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Wallets",
    items: [
      {
        href: "/admin/mnemonic",
        label: "HD Mnemonic",
        requires: "wallets.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10V7a5 5 0 0 1 10 0v3" />
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <circle cx="12" cy="15" r="1.5" />
          </svg>
        ),
      },
      {
        href: "/admin/init-wallet",
        label: "Initialize Wallet",
        requires: "wallets.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18" />
            <path d="M16 14h2" />
          </svg>
        ),
      },
      {
        href: "/admin/contracts",
        label: "Contracts",
        requires: "wallets.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
            <path d="M14 3h7v7" />
            <path d="M10 14L20 4" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Access",
    items: [
      {
        href: "/access/users",
        label: "Users",
        requires: "users.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20a6 6 0 0 1 12 0" />
            <path d="M16 3.5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9" />
          </svg>
        ),
      },
      {
        href: "/access/roles",
        label: "Roles",
        requires: "users.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        ),
      },
      {
        href: "/access/audit",
        label: "Audit log",
        requires: "audit.read",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16v16H4z" />
            <path d="M8 9h8M8 13h8M8 17h5" />
          </svg>
        ),
      },
    ],
  },
];

function isActive(pathname: string, item: Item) {
  const { href, exact } = item;
  const base = href.split("?")[0];
  if (base === "/" || exact) return pathname === base;
  return pathname === base || pathname.startsWith(`${base}/`);
}

// visibleSections filters items + sections by the user's permissions.
function visibleSections(perms: readonly Permission[]): Section[] {
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.requires || can(perms, i.requires)),
    }))
    .filter((s) => s.items.length > 0);
}

export function Sidebar() {
  const pathname = usePathname();
  const me = useMe();
  const visible = visibleSections(me.permissions);
  return (
    <aside
      aria-label="Primary navigation"
      className="hidden lg:flex w-64 shrink-0 border-r border-border bg-surface flex-col sticky top-0 h-screen"
    >
      <div className="px-5 h-14 flex items-center gap-2 border-b border-border">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-sm font-bold">
          P
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Prediction</span>
          <span className="text-xs text-foreground-muted -mt-0.5">Backoffice</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {visible.map((s) => (
          <div key={s.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
              {s.title}
            </div>
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = isActive(pathname, item);
                const k = item.key ?? item.href;
                if (item.child) {
                  return (
                    <li key={k}>
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
                            backgroundColor: active ? item.accent : "var(--border-strong)",
                          }}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.trailing}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={k}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-foreground/[0.06] text-foreground"
                          : "text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]"
                      }`}
                    >
                      <span className={`relative h-4 w-4 shrink-0 ${active ? "text-foreground" : ""}`}>
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

      <UserMenu />
    </aside>
  );
}

// UserMenu shows the signed-in user + sign out, replacing the old static footer.
function UserMenu() {
  const me = useMe();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold uppercase">
          {me.email.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate" title={me.email}>
            {me.email}
          </div>
          <div className="text-[10px] text-foreground-muted truncate">
            {me.is_root ? "root" : me.roles.join(", ") || "no roles"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <Link href="/access/password" className="text-foreground-muted hover:text-foreground">
          Change password
        </Link>
        <span className="text-border-strong">·</span>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="text-foreground-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

// Compact top bar used on mobile widths where the sidebar is hidden.
export function MobileBar() {
  const pathname = usePathname();
  const me = useMe();
  const visible = visibleSections(me.permissions);
  const allItems = visible.flatMap((s) => s.items);
  const active = allItems.find((i) => isActive(pathname, i));

  const [open, setOpen] = useState(false);
  const menuId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <header className="lg:hidden sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="px-4 h-14 flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-sm font-bold">
          P
        </span>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-semibold tracking-tight">Prediction</span>
          <span className="text-xs text-foreground-muted -mt-0.5 truncate">
            {active?.label ?? "Backoffice"}
          </span>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-border bg-surface text-sm hover:bg-foreground/5 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6l-12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
            <span>Menu</span>
          </button>
          {open ? (
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              aria-label="Primary navigation"
              className="absolute right-0 mt-2 w-72 max-h-[calc(100dvh-4.5rem)] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg p-3 space-y-4 z-40"
            >
              {visible.map((s) => (
                <div key={s.title}>
                  <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
                    {s.title}
                  </div>
                  <ul className="space-y-0.5">
                    {s.items.map((item) => (
                      <li key={item.key ?? item.href}>
                        <Link
                          href={item.href}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 px-2 py-2.5 rounded-md text-sm hover:bg-foreground/5 active:bg-foreground/10"
                        >
                          <span className="h-4 w-4 shrink-0">{item.icon}</span>
                          <span className="flex items-center gap-2 flex-1 min-w-0">
                            {item.accent ? dot(item.accent) : null}
                            <span className="truncate">{item.label}</span>
                          </span>
                          {item.trailing}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="border-t border-border pt-2 flex items-center justify-between text-[11px]">
                <span className="truncate text-foreground-muted" title={me.email}>
                  {me.email}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.assign("/login");
                  }}
                  className="text-foreground-muted hover:text-foreground cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
