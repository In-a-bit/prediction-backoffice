import { PageHeader } from "@/components/ui";

import { FromDescriptionForm } from "./from-description-form";

export const dynamic = "force-dynamic";

export default function FromDescriptionPage() {
  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <PageHeader
        title="Create from description (AI)"
        description="Describe an event or a series of events in prose. Gemini drafts a structured payload — you review and edit before any writes hit dpm-api."
      />
      <FromDescriptionForm />
    </div>
  );
}
