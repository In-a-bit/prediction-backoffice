import Link from "next/link";

import { Badge, Card, CardBody, PageHeader, buttonVariants } from "./ui";
import type { Behavior } from "@/lib/behaviors";

// Renders an intentional "coming soon" page for an automation behavior:
// hero header carrying the behavior's accent, feature checklist, and a
// mock preview of what the operating UI will look like once shipped.
export function ComingSoonBehavior({ behavior }: { behavior: Behavior }) {
  return (
    <div className="space-y-6">
      <div className="text-sm text-foreground-muted">
        <Link href="/automations" className="hover:text-foreground">
          ← All automations
        </Link>
      </div>

      <PageHeader
        title={behavior.name}
        description={behavior.tagline}
        actions={<Badge tone="neutral">Coming soon</Badge>}
      />

      <Card className="overflow-hidden">
        <div
          className="px-6 py-8 flex flex-col md:flex-row items-start gap-6"
          style={{
            backgroundImage: `linear-gradient(135deg, ${behavior.accentSoft} 0%, transparent 70%)`,
          }}
        >
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: behavior.accentSoft,
              color: behavior.accent,
            }}
          >
            <span className="h-8 w-8">{behavior.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              What this behavior will do
            </h2>
            <p className="text-sm text-foreground-muted mt-1 max-w-2xl">
              {behavior.description}
            </p>
            <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {behavior.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: behavior.accent }}
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardBody className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">Operator preview</h3>
            <p className="text-xs text-foreground-muted">
              A sketch of the UI you&apos;ll get here.
            </p>
            <MockTable accent={behavior.accent} />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-5 space-y-4">
            <h3 className="text-sm font-semibold">Planned controls</h3>
            <ul className="space-y-2 text-sm">
              <PlannedControl label="Pause / resume" />
              <PlannedControl label="Bulk edit selected" />
              <PlannedControl label="Filter by status / source" />
              <PlannedControl label="Force-resolve override" />
              <PlannedControl label="Audit log per item" />
            </ul>
            <div className="pt-2 border-t border-border">
              <Link href="/automations" className={buttonVariants.secondary}>
                Back to automations
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PlannedControl({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-foreground-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
      {label}
    </li>
  );
}

// Decorative mock table — placeholder rows so the empty page feels intentional
// rather than blank.
function MockTable({ accent }: { accent: string }) {
  const rows = [
    { id: "01", state: "Draft", emphasis: 0.35 },
    { id: "02", state: "Scheduled", emphasis: 0.55 },
    { id: "03", state: "Live", emphasis: 0.85 },
    { id: "04", state: "Resolving", emphasis: 0.6 },
    { id: "05", state: "Settled", emphasis: 0.25 },
  ];
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface-muted/40">
      <div className="grid grid-cols-12 px-4 py-2 text-[10px] uppercase tracking-wider text-foreground-muted border-b border-border">
        <div className="col-span-1">#</div>
        <div className="col-span-5">Title</div>
        <div className="col-span-3">State</div>
        <div className="col-span-3 text-right">Progress</div>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid grid-cols-12 px-4 py-3 border-b border-border last:border-0 items-center text-sm"
        >
          <div className="col-span-1 text-foreground-muted">{r.id}</div>
          <div className="col-span-5">
            <div className="h-2.5 rounded bg-foreground/10 w-3/4" />
          </div>
          <div className="col-span-3 text-foreground-muted">{r.state}</div>
          <div className="col-span-3">
            <div
              className="h-2 rounded-full ml-auto"
              style={{
                backgroundColor: accent,
                width: `${Math.round(r.emphasis * 100)}%`,
                opacity: 0.65,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
