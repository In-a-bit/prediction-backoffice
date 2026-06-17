"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// EventAutoRefresh triggers a server-component refresh on an interval so
// the event detail page (markets table + decision block) stays current
// without the operator reloading. The embedded <DeployPlanDriver/> already
// polls its own data at 1s; this refresh keeps everything *around* the
// driver fresh.
//
// We only refresh when there's a deploy plan in flight — once the slot
// completes and the decision dispatches, polling stops to avoid hammering
// the server.
export function EventAutoRefresh({
  deployPlanId,
  intervalMs = 2000,
}: {
  deployPlanId?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!deployPlanId) return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [deployPlanId, intervalMs, router]);
  return null;
}
