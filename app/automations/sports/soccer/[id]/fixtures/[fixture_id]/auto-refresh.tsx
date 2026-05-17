"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// FixtureAutoRefresh triggers a server-component refresh on an interval so
// the fixture detail page (markets table + decisions block) stays current
// without the user reloading. The embedded <DeployPlanDriver/> already
// polls its own data at 1s; this refresh keeps everything *around* the
// driver fresh.
//
// We only refresh when there's a creation plan in flight — once the plan
// completes and decisions have settled, polling stops to avoid hammering
// the server.
export function FixtureAutoRefresh({
  creationPlanId,
  intervalMs = 2000,
}: {
  creationPlanId?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!creationPlanId) return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [creationPlanId, intervalMs, router]);
  return null;
}
