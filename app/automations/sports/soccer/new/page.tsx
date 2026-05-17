import Link from "next/link";

import { PageHeader, buttonVariants } from "@/components/ui";
import { NewSportTaskForm } from "./form";

export const dynamic = "force-dynamic";

export default function NewSportTaskPage() {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <PageHeader
        title="Add soccer league"
        description="Pick a league from api-football, a season, the market behaviors you want spawned per fixture, and how far in advance to create them. After creation, every fixture in the window gets a DeployPlan you can monitor + intervene in."
      />
      <NewSportTaskForm />
      <div className="mt-10">
        <Link href="/automations/sports/soccer" className={buttonVariants.ghost}>
          ← Back to soccer leagues
        </Link>
      </div>
    </div>
  );
}
