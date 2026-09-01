import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, buttonVariants } from "@/components/ui";
import { sportPath, sportUi } from "@/lib/sports/registry";
import { NewSportTaskForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewSportTaskPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport: sportKey } = await params;
  const ui = sportUi(sportKey);
  if (!ui || !ui.available) notFound();

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <PageHeader
        title={`Add ${ui.shortLabel.toLowerCase()} league`}
        description={`Pick a league, a season, the market behaviors you want spawned per ${ui.contest.singular}, and how far in advance to create them. After creation, every ${ui.contest.singular} in the window gets a DeployPlan you can monitor + intervene in.`}
      />
      <NewSportTaskForm sportKey={sportKey} />
      <div className="mt-10">
        <Link href={sportPath(sportKey)} className={buttonVariants.ghost}>
          ← Back to {ui.shortLabel.toLowerCase()} leagues
        </Link>
      </div>
    </div>
  );
}
