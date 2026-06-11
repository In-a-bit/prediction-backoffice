"use client";

import React, { useEffect, useState } from "react";
import Script from "next/script";
import { PageHeader } from "@/components/ui";

// Token lifetime is 10 min; refresh 60 s before expiry to keep the
// dashboard live during long operator sessions.
const TOKEN_TTL_MS = 10 * 60 * 1000;
const REFRESH_BEFORE_MS = 60 * 1000;

async function fetchToken(): Promise<string> {
  const res = await fetch("/api/metabase-token");
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  return token;
}

export default function AnalyticsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const t = await fetchToken();
        setToken(t);
        setError(null);
        // Schedule next refresh.
        timerId = setTimeout(load, TOKEN_TTL_MS - REFRESH_BEFORE_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void load();
    return () => clearTimeout(timerId);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Embedded Metabase dashboard for platform-wide analytics and reporting."
      />

      {/* Metabase config — must be defined before embed.js runs. */}
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

      {/* Metabase embed runtime. */}
      <Script
        src="https://metabase.inabit.dev/app/embed.js"
        strategy="afterInteractive"
      />

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-5 py-4 text-sm text-danger">
          Failed to load dashboard token: {error}
        </div>
      ) : !token ? (
        <div className="rounded-xl border border-border bg-surface min-h-[600px] flex items-center justify-center text-sm text-foreground-muted">
          Loading dashboard…
        </div>
      ) : (
        /* The custom element is upgraded by embed.js once loaded.
           React.createElement is used so TypeScript doesn't reject the
           hyphenated web-component tag name. */
        <div className="rounded-xl border border-border overflow-hidden min-h-[600px]">
          {React.createElement("metabase-dashboard", {
            token,
            "with-title": "true",
            "with-downloads": "true",
          })}
        </div>
      )}
    </div>
  );
}
