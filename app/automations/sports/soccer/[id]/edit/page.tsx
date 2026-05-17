import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, buttonVariants } from "@/components/ui";
import { sports } from "@/lib/api";
import { formatFootballSeason } from "@/lib/format";
import { EditLeagueConfigForm } from "./form";

export const dynamic = "force-dynamic";

export default async function EditLeagueConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const cfg = await sports.getLeagueConfig(id).catch(() => null);
  if (!cfg) notFound();

  const leagueName = String(cfg.league_metadata?.name ?? cfg.league_slug);

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <PageHeader
        title={`Edit ${leagueName} — ${formatFootballSeason(cfg.api_season)}`}
        description={`League id ${cfg.api_league_id} · series slug ${cfg.series_slug}. League + season are immutable after creation; toggle markets and operational config below.`}
      />

      <EditLeagueConfigForm config={cfg} />

      <div className="mt-10 flex items-center gap-3">
        <Link href={`/automations/sports/soccer/${cfg.id}`} className={buttonVariants.ghost}>
          ← Back to league
        </Link>
      </div>
    </div>
  );
}
