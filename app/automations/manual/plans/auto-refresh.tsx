"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// AutoRefresh re-fetches the current Server Component on a fixed interval.
// Used by the plans list page to surface backend progress on running plans
// without forcing the operator to hit the browser refresh button.
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
