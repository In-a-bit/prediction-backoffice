"use client";

import { useEffect } from "react";

import { Card, CardBody, buttonVariants } from "@/components/ui";

// app/error.tsx — top-level segment error boundary. Receives the digest of
// the original server error which is also written to /operations/alerts via
// instrumentation.ts::onRequestError, so operators can correlate the red
// state they see with the alert row they triage.

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Best-effort console echo for local dev. Production capture happens in
    // instrumentation.ts::onRequestError where we have the full request
    // context.
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-xl w-full">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </span>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="text-sm text-foreground-muted">
                The page failed to render. The error has been recorded — you
                can view it on the alerts page and acknowledge once resolved.
              </p>
              {error.digest ? (
                <p className="text-xs text-foreground-muted font-mono">
                  digest: {error.digest}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className={buttonVariants.primary}
            >
              Try again
            </button>
            <a href="/operations/alerts" className={buttonVariants.secondary}>
              View alerts
            </a>
            <a href="/operations" className={buttonVariants.ghost}>
              Back to operations
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
