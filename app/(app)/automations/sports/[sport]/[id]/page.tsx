import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { sports } from "@/lib/api";
import { sportPath, sportUi } from "@/lib/sports/registry";
import { SportTaskControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function SportTaskDetailPage({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport: sportKey, id: idStr } = await params;
  const ui = sportUi(sportKey);
  if (!ui || !ui.available) notFound();

  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [cfg, contests] = await Promise.all([
    sports.getTask(id).catch(() => null),
    sports.listEvents(id).catch(() => []),
  ]);
  if (!cfg) notFound();

  const leagueName = String(cfg.league_metadata?.name ?? cfg.league_slug);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <PageHeader
        title={`${leagueName} — ${ui.formatSeason(cfg.api_season)}`}
        description={`Series ${cfg.series_slug} · ${ui.shortLabel.toLowerCase()} league ${cfg.api_league_id}`}
      />

      <div className="mb-4">
        <Link
          href={sportPath(sportKey, cfg.id, "edit")}
          className={buttonVariants.secondary}
        >
          Edit config
        </Link>
      </div>

      <SportTaskControls sportKey={sportKey} config={cfg} />

      <h2 className="mt-10 mb-3 text-lg font-semibold capitalize">{ui.contest.plural}</h2>
      {contests.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-foreground-muted">
            No {ui.contest.plural} ingested yet. The upcoming ticker runs every {Math.round(60 * 5)}s
            — within the next 5 minutes upcoming {ui.contest.plural} within your time-ahead window
            should appear here.
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contests.map((contest) => {
            const parsed = ui.parseContest(contest.fixture_payload);
            return (
              <Link
                key={contest.id}
                href={sportPath(sportKey, cfg.id, "events", contest.id)}
                className="block"
              >
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {parsed ? `${parsed.homeName} vs ${parsed.awayName}` : "—"}
                      </div>
                      <div className="text-xs text-foreground-muted">
                        {new Date(contest.kickoff_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                    <Badge tone={ui.statusTone(contest.fixture_status_short)}>
                      {contest.fixture_status_short}
                    </Badge>
                  </CardHeader>
                  <CardBody className="text-xs text-foreground-muted">
                    {contest.creation_plan_external_id ? (
                      <span>
                        plan{" "}
                        <code className="font-mono">
                          {shortId(contest.creation_plan_external_id)}
                        </code>
                        {contest.backfill_plan_external_ids?.length
                          ? ` + ${contest.backfill_plan_external_ids.length} backfill`
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
        <Link href={sportPath(sportKey)} className={buttonVariants.ghost}>
          ← Back to {ui.shortLabel.toLowerCase()} leagues
        </Link>
      </div>
    </div>
  );
}

function shortId(id: string): string {
  return id.split("-")[0] ?? id.slice(0, 8);
}
