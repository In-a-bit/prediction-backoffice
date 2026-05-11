"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Polls the route by calling router.refresh() on a fixed interval. Includes a
// manual refresh button + a toggle. Pauses while the tab is hidden so we don't
// keep the API busy in the background.
export function AutoRefresh({
  intervalMs = 15_000,
  label = "Live",
}: {
  intervalMs?: number;
  label?: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [lastTick, setLastTick] = useState<Date>(new Date());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
        setLastTick(new Date());
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);

  function manualRefresh() {
    router.refresh();
    setLastTick(new Date());
  }

  return (
    <div className="inline-flex items-center gap-2 text-xs text-foreground-muted">
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
          enabled
            ? "border-success/30 bg-success/10 text-success"
            : "border-border text-foreground-muted hover:text-foreground"
        }`}
        title={enabled ? "Pause auto-refresh" : "Resume auto-refresh"}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            enabled ? "bg-success animate-pulse" : "bg-foreground-muted/40"
          }`}
        />
        {label}
      </button>
      <button
        type="button"
        onClick={manualRefresh}
        className="px-2 py-1 rounded-md border border-border hover:bg-foreground/5"
        title="Refresh now"
      >
        Refresh
      </button>
      <span className="hidden sm:inline">
        Updated {timeAgo(lastTick)}
      </span>
    </div>
  );
}

function timeAgo(d: Date) {
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}
