"use client";

import { Command } from "cmdk";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge, buttonVariants } from "@/components/ui";
import type { SeriesResponse } from "@/lib/types";

// SeriesSearchSelect — fuzzy search over series title + slug, hitting the new
// /api/manual/series/search route which proxies the prediction-bundler
// /manual/series/search endpoint (Phase 5 carve-out). Until that endpoint
// ships, the route falls back to slug-exact lookup so this component still
// works for operators who paste a known slug.
//
// The component owns its own popover (rather than reusing ComboSearch)
// because the option list is fetched on-demand and we want to keep the
// search input focused while results stream in.

export function SeriesSearchSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (externalId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SeriesResponse[]>([]);
  const [resolved, setResolved] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Drop the resolved chip when the parent clears `value`.
  const effectiveResolved = value ? resolved : null;

  // Debounced fetch on query change.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }
    const id = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/manual/series/search?q=${encodeURIComponent(trimmed)}&limit=12`,
            { signal: ac.signal },
          );
          if (!res.ok) {
            setError(`Lookup failed: ${res.status}`);
            setResults([]);
            return;
          }
          const data = (await res.json()) as SeriesResponse[];
          setResults(Array.isArray(data) ? data : []);
          setError(null);
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Lookup failed");
        }
      });
    }, 200);
    return () => window.clearTimeout(id);
  }, [query, open]);

  // Outside-click + escape close the popover.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  const select = (s: SeriesResponse) => {
    setResolved(s);
    onChange(s.external_id);
    setOpen(false);
    setQuery("");
  };

  const clear = () => {
    setResolved(null);
    setQuery("");
    onChange("");
  };

  // Resolved chip view.
  if (value && effectiveResolved) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-foreground/[0.03] px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{effectiveResolved.title}</span>
          <span className="text-[11px] text-foreground-muted font-mono">
            {effectiveResolved.slug} · {effectiveResolved.external_id.slice(0, 8)}…
          </span>
        </div>
        <button type="button" onClick={clear} className={buttonVariants.ghost}>
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-border bg-surface text-sm hover:border-border-strong transition-colors cursor-pointer"
      >
        <span className="text-foreground-muted">
          {value
            ? "Linked — replace with another series"
            : "Search series by title or slug…"}
        </span>
        <ChevronDownIcon />
      </button>
      {value && !effectiveResolved ? (
        <div className="flex items-center gap-2 text-xs text-foreground-muted mt-1">
          <Badge tone="info">linked</Badge>
          <span className="font-mono break-all">{value}</span>
          <button
            type="button"
            onClick={clear}
            className="text-danger hover:underline cursor-pointer"
          >
            clear
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden">
          <Command shouldFilter={false} loop>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Type to fuzzy-search…"
              className="w-full px-3 py-2 text-sm bg-transparent border-b border-border focus:outline-none placeholder:text-foreground-muted/70"
            />
            <Command.List className="max-h-72 overflow-y-auto py-1">
              {!query.trim() ? (
                <div className="px-3 py-3 text-xs text-foreground-muted">
                  Start typing to search. Matches against series title + slug.
                </div>
              ) : isPending && results.length === 0 ? (
                <div className="px-3 py-3 text-xs text-foreground-muted">
                  Searching…
                </div>
              ) : null}
              {error ? (
                <div className="px-3 py-3 text-xs text-danger">{error}</div>
              ) : null}
              {results.length === 0 && !isPending && query.trim() && !error ? (
                <Command.Empty className="px-3 py-3 text-xs text-foreground-muted">
                  No series matches. The fuzzy endpoint may not be deployed
                  yet — the slug-exact fallback is in use.
                </Command.Empty>
              ) : null}
              {results.map((s) => (
                <Command.Item
                  key={s.external_id}
                  value={s.external_id}
                  onSelect={() => select(s)}
                  className="flex flex-col gap-0.5 px-3 py-2 text-sm cursor-pointer transition-colors data-[selected=true]:bg-foreground/[0.06] hover:bg-foreground/[0.04]"
                >
                  <span className="font-medium">{s.title || s.slug}</span>
                  <span className="text-[11px] text-foreground-muted font-mono">
                    {s.slug} · {s.external_id.slice(0, 8)}…
                  </span>
                </Command.Item>
              ))}
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
      className="text-foreground-muted"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
