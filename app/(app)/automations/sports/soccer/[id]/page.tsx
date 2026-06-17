import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { sports } from "@/lib/api";
import { formatFootballSeason } from "@/lib/format";
import { SportTaskControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function SportTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [cfg, fixtures] = await Promise.all([
    sports.getTask(id).catch(() => null),
    sports.listEvents(id).catch(() => []),
  ]);
  if (!cfg) notFound();

  const leagueName = String(cfg.league_metadata?.name ?? cfg.league_slug);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <PageHeader
        title={`${leagueName} — ${formatFootballSeason(cfg.api_season)}`}
        description={`Series ${cfg.series_slug} · api-football league ${cfg.api_league_id}`}
      />

      <div className="mb-4">
        <Link
          href={`/automations/sports/soccer/${cfg.id}/edit`}
          className={buttonVariants.secondary}
        >
          Edit config
        </Link>
      </div>

      <SportTaskControls config={cfg} />

      <h2 className="mt-10 mb-3 text-lg font-semibold">Fixtures</h2>
      {fixtures.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-foreground-muted">
            No fixtures ingested yet. The upcoming ticker runs every {Math.round(60 * 5)}s — within
            the next 5 minutes upcoming fixtures within your time-ahead window should appear here.
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fixtures.map((fx) => {
            const homeName = String(
              (fx.fixture_payload as Record<string, unknown> | undefined)?.teams &&
                ((fx.fixture_payload as { teams?: { home?: { name?: string } } }).teams?.home?.name) ||
                "?",
            );
            const awayName = String(
              ((fx.fixture_payload as { teams?: { away?: { name?: string } } }).teams?.away?.name) || "?",
            );
            return (
              <Link
                key={fx.id}
                href={`/automations/sports/soccer/${cfg.id}/events/${fx.id}`}
                className="block"
              >
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{homeName} vs {awayName}</div>
                      <div className="text-xs text-foreground-muted">
                        {new Date(fx.kickoff_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                    <Badge tone={statusTone(fx.fixture_status_short)}>
                      {fx.fixture_status_short}
                    </Badge>
                  </CardHeader>
                  <CardBody className="text-xs text-foreground-muted">
                    {fx.creation_plan_external_id ? (
                      <span>
                        plan{" "}
                        <code className="font-mono">{shortId(fx.creation_plan_external_id)}</code>
                        {fx.backfill_plan_external_ids?.length
                          ? ` + ${fx.backfill_plan_external_ids.length} backfill`
                          : ""}
                      </span>
                    ) : (
                      <span>no plan yet</span>
                    )}
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-10">
        <Link href="/automations/sports/soccer" className={buttonVariants.ghost}>
          ← Back to soccer leagues
        </Link>
      </div>
    </div>
  );
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "FT":
    case "AET":
    case "PEN":
      return "success";
    case "1H":
    case "HT":
    case "2H":
    case "ET":
    case "BT":
    case "P":
    case "LIVE":
      return "info";
    case "PST":
    case "SUSP":
    case "INT":
      return "warning";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "danger";
    default:
      return "neutral";
  }
}

function shortId(id: string): string {
  return id.split("-")[0] ?? id.slice(0, 8);
}
