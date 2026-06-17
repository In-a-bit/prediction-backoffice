import { PageHeader } from "@/components/ui";

import { FromSlugForm } from "./from-slug-form";

export const dynamic = "force-dynamic";

export default function FromSlugPage() {
  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <PageHeader
        title="Create event from Polymarket slug"
        description="Paste an event slug from polymarket.com. We fetch the gamma payload, ask Gemini to adapt it to our schema, and let you review before any writes hit dpm-api."
      />
      <FromSlugForm />
    </div>
  );
}
