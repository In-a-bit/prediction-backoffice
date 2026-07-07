import { PageHeader } from "@/components/ui";

import { SeriesForm } from "./series-form";

export const dynamic = "force-dynamic";

export default function NewSeriesPage() {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <PageHeader
        title="New series"
        description="Create a series row in dpm-api. All optional fields default to the server's defaults when left blank."
      />
      <SeriesForm />
    </div>
  );
}
