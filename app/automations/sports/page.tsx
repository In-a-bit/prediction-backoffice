import Link from "next/link";

import { Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { behaviors } from "@/lib/behaviors";

export const dynamic = "force-dynamic";

const SPORTS = [
  {
    key: "soccer",
    href: "/automations/sports/soccer",
    title: "Soccer (Football)",
    description:
      "EPL, La Liga, Bundesliga, Champions League — any league/season on api-football. Moneyline + halftime markets per fixture, auto-proposed to UMA.",
    available: true,
  },
  {
    key: "basketball",
    href: "#",
    title: "Basketball",
    description: "Coming soon. Plugs into the same scheduler — new market_types + a basketball strategy.",
    available: false,
  },
  {
    key: "nba",
    href: "#",
    title: "NBA",
    description: "Coming soon. Same plugin pattern as basketball but on the richer NBA v2 endpoint.",
    available: false,
  },
  {
    key: "mma",
    href: "#",
    title: "MMA",
    description: "Coming soon. Single-fight moneyline + method-of-victory once the api-sports MMA client lands.",
    available: false,
  },
] as const;

export default function SportsHubPage() {
  const accent = behaviors.sports.accent;
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <PageHeader
        title="Sports fixtures"
        description="Subscribe to a league + season. The backoffice ingests upcoming fixtures, creates a DeployPlan per fixture with the configured market behaviors, then auto-proposes resolution to UMA when the fixture finishes."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SPORTS.map((sport) =>
          sport.available ? (
            <Link key={sport.key} href={sport.href} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="font-semibold">{sport.title}</span>
                </CardHeader>
                <CardBody className="text-sm text-foreground-muted">{sport.description}</CardBody>
              </Card>
            </Link>
          ) : (
            <Card key={sport.key} className="h-full opacity-60">
              <CardHeader className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full bg-foreground-muted"
                />
                <span className="font-semibold">{sport.title}</span>
                <span className="ml-auto text-xs uppercase tracking-wide text-foreground-muted">
                  coming soon
                </span>
              </CardHeader>
              <CardBody className="text-sm text-foreground-muted">{sport.description}</CardBody>
            </Card>
          ),
        )}
      </div>

      <div className="mt-10">
        <Link href="/automations" className={buttonVariants.ghost}>
          ← Back to all behaviors
        </Link>
      </div>
    </div>
  );
}
