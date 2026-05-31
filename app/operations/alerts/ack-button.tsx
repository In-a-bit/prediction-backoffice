"use client";

import { useTransition } from "react";

import { acknowledgeAlertAction } from "./actions";

// Tiny client component for the per-row Acknowledge action. Wraps the server
// action in a form so the button stays accessible without JavaScript, but
// uses useTransition for the in-flight loading state when JS is on.

export function AckButton({
  externalId,
  acknowledged,
  size = "sm",
}: {
  externalId: string;
  acknowledged: boolean;
  size?: "sm" | "md";
}) {
  const [isPending, startTransition] = useTransition();
  if (acknowledged) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-success ${
          size === "sm" ? "text-xs" : "text-sm"
        }`}
        aria-label="Acknowledged"
      >
        <CheckIcon />
        <span>Acked</span>
      </span>
    );
  }
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await acknowledgeAlertAction(fd);
        });
      }}
    >
      <input type="hidden" name="external_id" value={externalId} />
      <button
        type="submit"
        disabled={isPending}
        className={`inline-flex items-center gap-1 px-2 ${
          size === "sm" ? "h-7 text-xs" : "h-8 text-sm"
        } rounded-md border border-border bg-foreground/5 hover:bg-foreground/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
        aria-label="Acknowledge alert"
      >
        {isPending ? <Spinner /> : <CheckIcon />}
        <span>{isPending ? "…" : "Ack"}</span>
      </button>
    </form>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 11-9-9" strokeLinecap="round" />
    </svg>
  );
}
