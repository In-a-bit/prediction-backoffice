"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatDateTimeFull, formatRelative } from "@/lib/format";

// Tracks how many SideDrawers are currently mounted so the scroll lock
// survives two stacking (e.g. the question_id drawer opening a lifecycle
// event drawer on top): only the first mount locks, only the last unmount
// unlocks, regardless of close order.
let openDrawerCount = 0;

// Shared chrome for the market detail page's on-chain drawers: a right
// slide-over that goes full-screen below the `sm` breakpoint, with a
// click-to-dismiss backdrop, Escape-to-close, a scroll lock on the page
// behind it, and initial focus on the close button. Callers own the header
// content and the body; everything else is fixed so every drawer reads the
// same. Returning focus to the trigger on close belongs to the caller, which
// is the only side that holds a ref to it.
export function SideDrawer({
  ariaLabel,
  header,
  onClose,
  children,
}: {
  ariaLabel: string;
  header: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    if (openDrawerCount === 0) document.body.style.overflow = "hidden";
    openDrawerCount += 1;
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      openDrawerCount -= 1;
      if (openDrawerCount === 0) document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="flex-1 bg-foreground/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="w-full sm:w-[28rem] h-full bg-background border-l border-border shadow-xl overflow-y-auto animate-in slide-in-from-right">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur px-5 py-4 border-b border-border flex items-start gap-3">
          <div className="flex-1 min-w-0">{header}</div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground p-1 rounded-md hover:bg-foreground/5 cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

// Off by default: the drawer shows its formatted, labelled sections. On: the
// raw on-chain fields verbatim — same names, order and units a Polygonscan
// "Read Contract" call (or the raw event log) would show.
export function RawDataToggle({
  raw,
  onToggle,
}: {
  raw: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={raw}
      title="Toggle raw on-chain output"
      className={
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors " +
        (raw
          ? "bg-accent/10 text-accent border-accent/20 dark:bg-accent/20"
          : "bg-foreground/5 text-foreground-muted border-border hover:text-foreground")
      }
    >
      <span
        className={
          "w-1.5 h-1.5 rounded-full " + (raw ? "bg-accent" : "bg-foreground-muted/40")
        }
      />
      RAW DATA
    </button>
  );
}

// ----- Row primitives shared by every drawer body -----

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-foreground-muted mb-2">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-foreground-muted text-xs">{label}</span>
      <span
        className={
          "text-right break-all " + (mono ? "font-mono text-xs" : "text-sm")
        }
      >
        {value}
      </span>
    </div>
  );
}

export function TimeRow({ label, value }: { label: string; value: Date | null }) {
  if (!value) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">{label}</span>
        <span className="text-xs text-foreground-muted">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-foreground-muted text-xs">{label}</span>
      <span className="text-right">
        <div className="text-xs font-mono">{formatDateTimeFull(value)}</div>
        <div className="text-[10px] text-foreground-muted">
          {formatRelative(value)}
        </div>
      </span>
    </div>
  );
}

export function CopyRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">{label}</span>
        <span className="text-xs text-foreground-muted">—</span>
      </div>
    );
  }
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked — silent
    }
  };
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[10px] text-foreground-muted hover:text-foreground cursor-pointer"
          aria-label={`Copy ${label}`}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <code className="block text-xs font-mono break-all bg-foreground/[0.03] border border-border rounded px-2 py-1">
        {value}
      </code>
    </div>
  );
}

// One raw field as the RAW DATA view renders it: the on-chain name, its
// Solidity type, and the value verbatim.
export type RawField = { name: string; type: string; value: string };

export function RawFieldList({
  signature,
  fields,
}: {
  signature: string;
  fields: RawField[];
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-foreground-muted">
        {signature}
      </p>
      <div className="space-y-2.5">
        {fields.map((field) => (
          <div key={field.name} className="border-b border-border/60 pb-2 last:border-0">
            <div className="text-[10px] text-foreground-muted">
              {field.name} <span className="text-foreground-muted/60">({field.type})</span>
            </div>
            <div className="text-xs font-mono break-all mt-0.5">{field.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function shortHex(value: string): string {
  const v = value.startsWith("0x") ? value.slice(2) : value;
  return v.length > 10 ? `${v.slice(0, 10)}…` : v;
}

// on-chain timestamps are unix seconds as base-10 strings; "0" means unset
// (e.g. manual_resolution_timestamp before a manual resolution window opens).
export function unixSecondsToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}
