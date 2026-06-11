"use client";

import React, { useEffect, useState } from "react";
import Script from "next/script";
import { PageHeader } from "@/components/ui";

// ---------------------------------------------------------------------------
// Dashboard registry — add new Metabase dashboards here.
// ---------------------------------------------------------------------------
const DASHBOARDS = [
  {
    id: 2,
    name: "Platform Overview",
    description: "High-level platform metrics and trading activity",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    id: 3,
    name: "Market Analytics",
    description: "Volume, liquidity, and market-level breakdown",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
  },
] as const;

// Token lifetime is 10 min; refresh 60 s before expiry.
const TOKEN_TTL_MS = 10 * 60 * 1000;
const REFRESH_BEFORE_MS = 60 * 1000;

async function fetchToken(dashboardId: number): Promise<string> {
  const res = await fetch(`/api/metabase-token?dashboard=${dashboardId}`);
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  return token;
}

export default function AnalyticsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch (and auto-refresh) the token whenever the selected dashboard changes.
  useEffect(() => {
    if (selectedId === null) return;
    let timerId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchToken(selectedId!);
        if (cancelled) return;
        setToken(t);
        setLoading(false);
        timerId = setTimeout(load, TOKEN_TTL_MS - REFRESH_BEFORE_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      clearTimeout(timerId);
      setToken(null);
    };
  }, [selectedId]);

  const selectedDashboard = DASHBOARDS.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {/* Metabase config — must be set before embed.js initialises. */}
      <Script
        id="metabase-config"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            function defineMetabaseConfig(config) {
              window.metabaseConfig = config;
            }
            defineMetabaseConfig({
              "theme": { "preset": "light" },
              "isGuest": true,
              "instanceUrl": "https://metabase.inabit.dev"
            });
          `,
        }}
      />
      <Script
        src="https://metabase.inabit.dev/app/embed.js"
        strategy="afterInteractive"
      />

      <PageHeader
        title="Analytics"
        description="Select a dashboard to view embedded Metabase analytics."
      />

      {/* Dashboard picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {DASHBOARDS.map((d) => {
          const active = d.id === selectedId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedId(d.id)}
              className={`group text-left rounded-xl border px-5 py-4 transition-all ${
                active
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border bg-surface hover:border-accent/40 hover:bg-foreground/[0.02]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 shrink-0 transition-colors ${
                    active ? "text-accent" : "text-foreground-muted group-hover:text-foreground"
                  }`}
                >
                  {d.icon}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold truncate ${
                      active ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {d.name}
                  </p>
                  <p className="text-xs text-foreground-muted mt-0.5 line-clamp-2">
                    {d.description}
                  </p>
                </div>
                {active && (
                  <span className="ml-auto shrink-0 mt-0.5">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Dashboard embed */}
      {selectedId === null ? (
        <div className="rounded-xl border border-border bg-surface/50 min-h-[400px] flex flex-col items-center justify-center gap-2 text-foreground-muted">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
          <p className="text-sm">Select a dashboard above to get started</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-5 py-4 text-sm text-danger">
          Failed to load dashboard token: {error}
        </div>
      ) : loading || !token ? (
        <div className="rounded-xl border border-border bg-surface min-h-[780px] flex items-center justify-center gap-2 text-sm text-foreground-muted">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Loading {selectedDashboard?.name}…
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden min-h-[780px]">
          {React.createElement("metabase-dashboard", {
            key: selectedId, // remount when dashboard changes
            token,
            "with-title": "true",
            "with-downloads": "true",
            style: { display: "block", width: "100%", height: "780px" },
          })}
        </div>
      )}
    </div>
  );
}
