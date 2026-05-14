import { PageHeader } from "@/components/ui";

import { EventForm } from "./event-form";

export const dynamic = "force-dynamic";

type SearchParams = { series_external_id?: string };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <PageHeader
        title="New event"
        description="Create an event row in dpm-api. After creation you can add markets one by one with sequential monitoring."
      />
      <EventForm initialSeriesExternalId={sp.series_external_id} />
    </div>
  );
}
