import Link from "next/link";

import { Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { behaviors } from "@/lib/behaviors";

export const dynamic = "force-dynamic";

const TILES = [
  {
    href: "/deploy-plans?source=manual",
    title: "Deploy plans",
    description:
      "Live and past market deploy queues — see what's running, recreate failed markets. Execution is backend-driven and survives UI/server restarts.",
  },
  {
    href: "/automations/manual/series/new",
    title: "New series",
    description:
      "Create a series row that events can be grouped under. Series are containers — recurring weekly markets, a sports league, a topic, etc.",
  },
  {
    href: "/automations/manual/events/new",
    title: "New event",
    description:
      "Create a single event with the full dpm-api field set. Use this when you know exactly what you want.",
  },
  {
    href: "/automations/manual/events/from-slug",
    title: "From Polymarket slug",
    description:
      "Paste a Polymarket event slug. Gemini adapts the gamma payload to our schema; you review then deploy series + event + markets sequentially.",
  },
  {
    href: "/automations/manual/events/from-description",
    title: "From description (AI)",
    description:
      "Describe an event or a series of events in prose. Gemini drafts the structured payload; you review then deploy.",
  },
  {
    href: "/operator-log?source=manual",
    title: "Operator log",
    description:
      "Audit trail filtered to manual writes — series, events, markets, recreate attempts. Lives under Inventory in the sidebar.",
  },
] as const;

export default function ManualHubPage() {
  const accent = behaviors.manual.accent;
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <PageHeader
        title="Manual creator"
        description="Hand-craft series, events, and markets — full field control, audit log, and sequential market deploy with monitor and recreate/skip."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map((tile) => (
          <Link key={tile.href} href={tile.href} className="block">
            <Card
              className="h-full transition-shadow hover:shadow-md"
            >
              <CardHeader className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <span className="font-semibold">{tile.title}</span>
              </CardHeader>
              <CardBody className="text-sm text-foreground-muted">
                {tile.description}
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-foreground-muted">
        Need to add markets to an event you already created? Open the event in{" "}
        <Link
          href="/operator-log?source=manual&resource_type=event"
          className="underline"
        >
          the operator log
        </Link>{" "}
        and click <em>Add markets</em>, or jump directly to{" "}
        <code className="font-mono">
          /automations/manual/events/&lt;external_id&gt;/markets/new
        </code>
        .
      </p>

      <div className="mt-6">
        <Link
          href="/automations"
          className={buttonVariants.ghost}
        >
          ← Back to all behaviors
        </Link>
      </div>
    </div>
  );
}
