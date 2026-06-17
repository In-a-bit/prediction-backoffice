"use server";

import { revalidatePath } from "next/cache";

import { acknowledgeAlert } from "@/lib/observability/store";

// Server actions backing the per-row Acknowledge button on /operations/alerts.
// Server actions keep the wiring small (no need for a custom route handler)
// and let the page revalidate after the ack so the row immediately re-renders
// in its acknowledged state.

export async function acknowledgeAlertAction(formData: FormData): Promise<void> {
  const externalId = String(formData.get("external_id") ?? "").trim();
  const actor = String(formData.get("actor") ?? "").trim() || "operator";
  if (!externalId) return;
  await acknowledgeAlert(externalId, actor);
  revalidatePath("/operations/alerts");
  revalidatePath("/operations");
}
