"use client";

import { Command } from "cmdk";
import { useEffect, useRef, useState, type ReactNode } from "react";

// ComboSearch — a low-chrome, headless searchable select used by the new
// inventory tables (events / markets / resolutions) and by the event creator
// for series + tags. Built on cmdk so keyboard navigation and accessibility
// are handled for us; the trigger button and option styling match the
// existing Tabs / Badge primitives.

export type ComboOption = {
  value: string;
  label: string;
  // Optional secondary line, e.g. slug under a series title.
  hint?: string;
  // Optional left-of-label icon (Heroicons / Lucide JSX). Matches the
  // SVG-only icon convention enforced by the design system.
  icon?: ReactNode;
};

export type ComboSearchProps = {
  options: ComboOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  // When true the user can clear the selection back to undefined.
  clearable?: boolean;
  // Aria label for the trigger when no visible label is provided.
  ariaLabel?: string;
  // Display label override for the trigger button. Defaults to the matching
  // option's label, or `placeholder` when nothing is selected.
  triggerLabel?: ReactNode;
  // Optional right-side icon inside the trigger (chevron by default).
  size?: "sm" | "md";
  // Empty-search hint text.
  emptyHint?: string;
  // Disabled state.
  disabled?: boolean;
  className?: string;
};

export function ComboSearch({
  options,
  value,
  onChange,
  placeholder = "Select…",
  clearable = false,
  ariaLabel,
  triggerLabel,
  size = "md",
  emptyHint = "No matches",
  disabled,
  className = "",
}: ComboSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close on outside click / escape — cmdk handles intra-popup keyboard but
  // we own the trigger, so the dismiss UX is ours.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Auto-focus search input when the popover opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const triggerHeight = size === "sm" ? "h-7 text-xs" : "h-9 text-sm";

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`inline-flex items-center justify-between gap-2 min-w-[10rem] ${triggerHeight} px-3 rounded-md border border-border bg-surface text-foreground hover:border-border-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.icon}
          <span className={`truncate ${selected ? "" : "text-foreground-muted"}`}>
            {triggerLabel ?? selected?.label ?? placeholder}
          </span>
        </span>
        <span className="flex items-center gap-1 text-foreground-muted">
          {clearable && selected ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
                setQuery("");
              }}
              className="hover:text-danger transition-colors cursor-pointer"
            >
              <XIcon />
            </span>
          ) : null}
          <ChevronDownIcon />
        </span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={ariaLabel ?? "Search options"}
          className="absolute z-30 mt-1 w-[20rem] max-w-[80vw] rounded-lg border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden"
        >
          <Command shouldFilter loop>
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={placeholder}
              className="w-full px-3 py-2 text-sm bg-transparent border-b border-border focus:outline-none placeholder:text-foreground-muted/70"
            />
            <Command.List className="max-h-64 overflow-y-auto py-1">
              <Command.Empty className="px-3 py-3 text-xs text-foreground-muted">
                {emptyHint}
              </Command.Empty>
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <Command.Item
                    key={opt.value}
                    value={`${opt.label} ${opt.hint ?? ""} ${opt.value}`}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors data-[selected=true]:bg-foreground/[0.06] hover:bg-foreground/[0.04] ${
                      isSelected ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {opt.icon}
                    <span className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.hint ? (
                        <span className="text-[11px] text-foreground-muted truncate">
                          {opt.hint}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? <CheckIcon /> : null}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
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
