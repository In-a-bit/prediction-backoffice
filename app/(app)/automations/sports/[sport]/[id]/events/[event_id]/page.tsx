import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { DeployPlanDriver } from "@/components/manual/deploy-plan-driver";
import { sports } from "@/lib/api";
import { sportPath, sportUi } from "@/lib/sports/registry";
import { SportEventActions } from "./actions";
import { SportEventAutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

export default async function SportEventDetailPage({
  params,
}: {
  params: Promise<{ sport: string; id: string; event_id: string }>;
}) {
  const { sport: sportKey, id: idStr, event_id: eventStr } = await params;
  const ui = sportUi(sportKey);
  if (!ui || !ui.available) notFound();

  const sportTaskId = Number.parseInt(idStr, 10);
  const eventId = Number.parseInt(eventStr, 10);
  if (!Number.isFinite(sportTaskId) || !Number.isFinite(eventId)) notFound();

  const contest = await sports.getEvent(eventId).catch(() => null);
  if (!contest) notFound();

  const parsed = ui.parseContest(contest.fixture_payload);
  const title = parsed ? `${parsed.homeName} vs ${parsed.awayName}` : `${ui.contest.singular} ${contest.api_fixture_id}`;
  const startedAt = new Date(contest.kickoff_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <SportEventAutoRefresh
        creationPlanId={contest.creation_plan_external_id}
        intervalMs={2000}
      />
      <PageHeader
        title={title}
        description={`${ui.shortLabel} ${ui.contest.singular} ${contest.api_fixture_id} · ${ui.contest.startLabel.toLowerCase()} ${startedAt} · status ${contest.fixture_status_short}`}
      />

      {parsed && (
        <div className="mb-6 flex items-center gap-4 text-sm">
          <Badge tone={ui.statusTone(contest.fixture_status_short)}>
            {contest.fixture_status_short}
          </Badge>
          <span className="font-mono text-lg">
            {parsed.scoreHome ?? "–"} : {parsed.scoreAway ?? "–"}
          </span>
          {parsed.partialLabel && parsed.partialHome != null && (
            <span className="text-xs text-foreground-muted">
              {parsed.partialLabel} {parsed.partialHome}–{parsed.partialAway}
            </span>
          )}
          <span className="text-xs text-foreground-muted">
            {parsed.leagueName}
            {parsed.country ? ` · ${parsed.country}` : ""}
          </span>
        </div>
      )}

      <SportEventActions
        eventId={contest.id}
        contestNoun={ui.contest.singular}
        hasCreationPlan={Boolean(contest.creation_plan_external_id)}
      />

      {/* Creation plan — uses the existing DeployPlanDriver verbatim. */}
      {contest.creation_plan_external_id ? (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Creation plan</h2>
          <DeployPlanDriver planExternalId={contest.creation_plan_external_id} />
        </div>
      ) : (
        <Card className="mt-8">
          <CardBody className="text-sm text-foreground-muted">
            No creation plan yet. Click <em>Force create now</em> above (or wait for the next
            upcoming-ticker tick) to spawn one.
          </CardBody>
        </Card>
      )}

      {/* Backfill plans — one DeployPlanDriver per plan. */}
      {contest.backfill_plan_external_ids && contest.backfill_plan_external_ids.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Backfill plans</h2>
          <div className="space-y-4">
            {contest.backfill_plan_external_ids.map((pid) => (
              <DeployPlanDriver key={pid} planExternalId={pid} />
            ))}
          </div>
        </div>
      )}

      {/* Decisions */}
      {contest.decisions && contest.decisions.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Resolution decisions</h2>
          <div className="space-y-3">
            {contest.decisions.map((d) => (
              <Card key={d.id}>
                <CardHeader className="flex items-center gap-3">
                  <span className="font-medium text-sm">Market type {d.sport_market_type_id}</span>
                  <Badge tone={d.decision_kind === "refund_5050" ? "warning" : "info"}>
                    {d.decision_kind}
                  </Badge>
                  {d.propose_dispatched_at ? (
                    <Badge tone="success">proposed</Badge>
                  ) : (
                    <Badge tone="neutral">pending propose</Badge>
                  )}
                  {d.resolve_dispatched_at && <Badge tone="success">resolved</Badge>}
                </CardHeader>
                <CardBody className="text-xs text-foreground-muted space-y-2">
                  <div>
                    Decided at {new Date(d.decided_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
                  </div>
                  <div className="font-mono">
                    Prices: {Object.entries(d.proposed_prices).map(([k, v]) => `${k}=${truncatePrice(v)}`).join(", ")}
                  </div>
                  <details>
                    <summary className="cursor-pointer">Input snapshot</summary>
                    <pre className="mt-2 p-2 bg-surface-2 rounded text-[10px] overflow-x-auto">
                      {JSON.stringify(d.decision_input_snapshot, null, 2)}
                    </pre>
                  </details>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Markets table */}
      {contest.markets && contest.markets.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Markets</h2>
          <div className="border rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="text-left px-3 py-2">Behavior</th>
                  <th className="text-left px-3 py-2">Outcome</th>
                  <th className="text-left px-3 py-2">Local status</th>
                  <th className="text-left px-3 py-2">External id</th>
                  <th className="text-left px-3 py-2">Position</th>
                </tr>
              </thead>
              <tbody>
                {contest.markets.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">{m.market_type_key}</td>
                    <td className="px-3 py-2">{m.outcome_key}</td>
                    <td className="px-3 py-2">
                      <Badge tone={localStatusTone(m.local_status)}>{m.local_status}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m.market_external_id ? shortId(m.market_external_id) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {m.deploy_plan_external_id ? `${shortId(m.deploy_plan_external_id)}#${m.deploy_plan_position ?? "?"}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-10">
        <Link href={sportPath(sportKey, sportTaskId)} className={buttonVariants.ghost}>
          ← Back to league
        </Link>
      </div>
    </div>
  );
}

function localStatusTone(s: string): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (s) {
    case "resolved":
    case "refunded":
      return "success";
    case "proposed":
    case "resolving":
    case "proposing":
    case "created":
      return "info";
    case "pending":
      return "neutral";
    case "cancelled":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function shortId(id: string): string {
  return id.split("-")[0] ?? id.slice(0, 8);
}

function truncatePrice(p: string): string {
  if (p === "1000000000000000000") return "YES";
  if (p === "0") return "NO";
  if (p === "500000000000000000") return "50/50";
  return p;
}
