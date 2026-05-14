import Link from "next/link";

import { Card, CardBody, ErrorMessage, PageHeader, buttonVariants } from "@/components/ui";
import { manual } from "@/lib/api";
import type { EventResponse } from "@/lib/types";

import { MarketsForm } from "./markets-form";

export const dynamic = "force-dynamic";

export default async function NewMarketsForEventPage({
  params,
}: {
  params: Promise<{ external_id: string }>;
}) {
  const { external_id } = await params;
  let event: EventResponse | null = null;
  let error: string | null = null;
  try {
    event = await manual.getEventByExternalId(external_id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto space-y-4">
      <PageHeader
        title={event ? `Markets for ${event.title}` : "Add markets"}
        description="Markets deploy one at a time via the dpm-api Temporal workflow. The next one waits for the previous to reach DEPLOYED. Failed markets can be recreated or skipped."
        actions={
          <Link href="/automations/manual" className={buttonVariants.ghost}>
            Back to hub
          </Link>
        }
      />

      {event ? (
        <Card>
          <CardBody className="text-sm space-y-1">
            <div>
              <span className="text-foreground-muted">Event:</span>{" "}
              <span className="font-medium">{event.title}</span>{" "}
              <span className="text-foreground-muted">
                (slug: {event.slug})
              </span>
            </div>
            <div className="text-[11px] text-foreground-muted font-mono">
              external_id: {event.external_id}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {error ? (
        <ErrorMessage>
          {error} — the event must have been created via the manual creator (the
          backoffice operator-log is the lookup source today). Open this URL
          directly only if you have the event&apos;s external_id from a recent
          create call.
        </ErrorMessage>
      ) : null}

      <MarketsForm eventExternalId={external_id} eventId={event?.id} />
    </div>
  );
}
