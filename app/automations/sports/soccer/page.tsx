import Link from "next/link";

import { Badge, Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { behaviors } from "@/lib/behaviors";
import { sports } from "@/lib/api";
import { formatFootballSeason } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SoccerHubPage() {
  const configs = await sports.listLeagueConfigs("soccer").catch(() => []);
  const accent = behaviors.sports.accent;

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <PageHeader
        title="Soccer leagues"
        description="One config per league + season. Each defines time-ahead window, which market behaviors to spawn per fixture, and toggles for create / resolve / metadata-update."
      />

      <div className="mb-6 flex items-center gap-3">
        <Link href="/automations/sports/soccer/new" className={buttonVariants.primary}>
          + Add league
        </Link>
        <Link
          href="/operator-log?source=sports"
          className={buttonVariants.ghost}
        >
          Operator log (sports)
        </Link>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-foreground-muted">
            No leagues configured yet. Click <strong>+ Add league</strong> to subscribe to one.
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {configs.map((cfg) => (
            <Link
              key={cfg.id}
              href={`/automations/sports/soccer/${cfg.id}`}
              className="block"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {String(cfg.league_metadata?.name ?? cfg.league_slug)} —{" "}
                      {formatFootballSeason(cfg.api_season)}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      Series <code className="font-mono">{cfg.series_slug}</code>
                    </div>
                  </div>
                  <Badge tone={cfg.is_create_active ? "success" : "warning"}>
                    {cfg.is_create_active ? "create on" : "create off"}
                  </Badge>
                </CardHeader>
                <CardBody className="text-sm text-foreground-muted space-y-1">
                  <div>
                    {cfg.market_types
                      .filter((mt) => !mt.deactivated_at)
                      .map((mt) => mt.key)
                      .join(", ") || "no market types active"}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>time ahead: {cfg.time_ahead_hours}h</span>
                    <span>•</span>
                    <span>fixtures ingested: {cfg.fixture_count}</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10">
        <Link href="/automations/sports" className={buttonVariants.ghost}>
          ← Back to sports
        </Link>
      </div>
    </div>
  );
}
