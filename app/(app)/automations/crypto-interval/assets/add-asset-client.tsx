"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { ErrorMessage, buttonVariants } from "@/components/ui";
import {
  createAssetAction,
  listSupportedPairsAction,
} from "@/lib/actions";
import type { SupportedPair } from "@/lib/types";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; pairs: SupportedPair[] }
  | { kind: "error"; message: string };

export function AddAssetClient({
  existingBases,
}: {
  existingBases: string[];
}) {
  const existing = useMemo(
    () => new Set(existingBases.map((b) => b.toLowerCase())),
    [existingBases],
  );

  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<SupportedPair | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadPairs() {
    setState({ kind: "loading" });
    startTransition(async () => {
      const res = await listSupportedPairsAction();
      if (res.ok) {
        setState({ kind: "loaded", pairs: res.data ?? [] });
      } else {
        setState({ kind: "error", message: res.error });
      }
    });
  }

  // Auto-load once mounted so users don't have to click an extra button.
  useEffect(() => {
    if (state.kind === "idle") loadPairs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(p: SupportedPair) {
    setSelected(p);
    setDisplayName(p.base.toUpperCase());
    setCreateError(null);
    setCreateSuccess(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setCreateError(null);
    setCreateSuccess(null);
    startTransition(async () => {
      const res = await createAssetAction({
        base: selected.base,
        display_name: displayName || selected.base.toUpperCase(),
        source_base: selected.source_base,
        target: selected.target,
        source_target: selected.source_target,
        is_active: true,
      });
      if (res.ok) {
        setCreateSuccess(
          `Added ${selected.base.toUpperCase()}/${selected.target.toUpperCase()}`,
        );
        setSelected(null);
        setDisplayName("");
      } else {
        setCreateError(res.error);
      }
    });
  }

  const filteredPairs = useMemo(() => {
    if (state.kind !== "loaded") return [];
    const f = filter.trim().toLowerCase();
    return state.pairs
      .filter((p) => !existing.has(p.base.toLowerCase()))
      .filter(
        (p) =>
          !f ||
          p.base.toLowerCase().includes(f) ||
          p.source_base.toLowerCase().includes(f),
      )
      .sort((a, b) => a.base.localeCompare(b.base));
  }, [state, filter, existing]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Filter… e.g. btc"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent"
          />
          <button
            type="button"
            onClick={loadPairs}
            disabled={state.kind === "loading"}
            className={buttonVariants.secondary}
          >
            {state.kind === "loading" ? "Loading…" : "Reload"}
          </button>
        </div>

        {state.kind === "error" ? (
          <ErrorMessage>{state.message}</ErrorMessage>
        ) : null}

        <div className="rounded-md border border-border max-h-72 overflow-y-auto">
          {state.kind === "loading" ? (
            <div className="p-4 text-sm text-foreground-muted">
              Loading supported pairs…
            </div>
          ) : state.kind === "loaded" && filteredPairs.length === 0 ? (
            <div className="p-4 text-sm text-foreground-muted">
              {state.pairs.length === 0
                ? "Source returned no pairs."
                : "No pairs match. All filtered pairs already exist."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredPairs.map((p) => {
                const isSelected =
                  selected?.base === p.base && selected?.target === p.target;
                return (
                  <li key={`${p.source_base}-${p.source_target}`}>
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 hover:bg-foreground/[0.04] transition-colors ${
                        isSelected ? "bg-accent/10 text-accent" : ""
                      }`}
                    >
                      <span className="font-medium">
                        {p.base.toUpperCase()}/{p.target.toUpperCase()}
                      </span>
                      <code className="text-xs text-foreground-muted">
                        {p.source_base}
                        {p.source_target}
                      </code>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-1.5">Selected</div>
          {selected ? (
            <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
              <div className="font-semibold">
                {selected.base.toUpperCase()}/{selected.target.toUpperCase()}
              </div>
              <div className="text-foreground-muted text-xs mt-1">
                Source: {selected.source_base}
                {selected.source_target}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-foreground-muted">
              Pick a pair from the left to continue.
            </div>
          )}
        </div>

        <label className="block">
          <div className="text-sm font-medium mb-1.5">Display name</div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Bitcoin"
            disabled={!selected}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent disabled:opacity-50"
          />
          <div className="text-xs text-foreground-muted mt-1">
            Used in market tags (e.g. &ldquo;Bitcoin&rdquo;).
          </div>
        </label>

        {createError ? <ErrorMessage>{createError}</ErrorMessage> : null}
        {createSuccess ? (
          <div className="text-sm text-success bg-success/10 border border-success/20 rounded-md px-3 py-2">
            {createSuccess}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!selected || pending}
          className={buttonVariants.primary}
        >
          {pending ? "Adding…" : "Add asset"}
        </button>
      </form>
    </div>
  );
}
