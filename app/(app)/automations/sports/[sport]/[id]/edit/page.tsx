import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, buttonVariants } from "@/components/ui";
import { sports } from "@/lib/api";
import { sportPath, sportUi } from "@/lib/sports/registry";
import { EditSportTaskForm } from "./form";

export const dynamic = "force-dynamic";

export default async function EditSportTaskPage({
  params,
}: {
  params: Promise<{ sport: string; id: string }>;
}) {
  const { sport: sportKey, id: idStr } = await params;
  const ui = sportUi(sportKey);
  if (!ui || !ui.available) notFound();

  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const cfg = await sports.getTask(id).catch(() => null);
  if (!cfg) notFound();

  const leagueName = String(cfg.league_metadata?.name ?? cfg.league_slug);

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <PageHeader
        title={`Edit ${leagueName} — ${ui.formatSeason(cfg.api_season)}`}
        description={`League id ${cfg.api_league_id} · series slug ${cfg.series_slug}. League + season are immutable after creation; toggle markets and operational config below.`}
      />

      <EditSportTaskForm config={cfg} sportKey={sportKey} />

      <div className="mt-10 flex items-center gap-3">
        <Link href={sportPath(sportKey, cfg.id)} className={buttonVariants.ghost}>
          ← Back to league
        </Link>
      </div>
    </div>
  );
}
