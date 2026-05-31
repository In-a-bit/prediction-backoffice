import Link from "next/link";

// BackLink — tiny breadcrumb-style "← back" affordance rendered when a
// detail page receives a ?from= hint. Lets operators jump back to the
// inventory / resolutions / alerts page that referred them in here without
// reaching for the browser back button.
//
// Pure server component. The only dependency is the searchParams.from string.

const BACK_TARGETS: Record<string, { href: string; label: string }> = {
  operations: { href: "/operations", label: "Operations" },
  publishing: { href: "/operations?view=publishing", label: "Operations" },
  live: { href: "/operations?view=live", label: "Operations · Live" },
  alerts: { href: "/operations/alerts", label: "Operator alerts" },
  markets: { href: "/markets", label: "Markets" },
  events: { href: "/events", label: "Events" },
  resolutions: { href: "/resolutions", label: "Resolution Manager" },
  "operator-log": { href: "/operator-log", label: "Operator log" },
};

export function BackLink({ from }: { from: string | undefined }) {
  if (!from) return null;
  const target = BACK_TARGETS[from];
  if (!target) return null;
  return (
    <Link
      href={target.href}
      className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors mb-2 cursor-pointer"
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <span>Back to {target.label}</span>
    </Link>
  );
}
