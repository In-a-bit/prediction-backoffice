"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/permission-context";
import {
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  Field,
  InfoMessage,
  PageHeader,
  buttonVariants,
  inputClass,
} from "@/components/ui";
import type { BuilderRow } from "@/lib/api";

const DEFAULT_PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const PRIVATE_KEY_PREFIX = "bld_sk_";

type ListResponse = {
  data: BuilderRow[];
  total: number;
  limit: number;
  offset: number;
};

// Mask everything after the "bld_sk_" prefix. Unlike the publishable key on the
// builders page this one is a bearer secret: it lets a builder's backend act for
// every address it onboarded, so it stays hidden until deliberately revealed.
function maskPrivateKey(key: string) {
  if (key.startsWith(PRIVATE_KEY_PREFIX)) {
    return `${PRIVATE_KEY_PREFIX}${"•".repeat(12)}`;
  }
  return "•".repeat(16);
}

export default function CustodyBuildersPage() {
  const canManage = useCan("builders.manage");

  const [rows, setRows] = useState<BuilderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [created, setCreated] = useState(false);

  // Row-level state: which key operation is in flight, what it failed with, and
  // the key a just-issued row returned so it can be copied without revealing it.
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState("");
  const [newKey, setNewKey] = useState("");

  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());
  const [copiedRowId, setCopiedRowId] = useState<number | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  const offset = (page - 1) * perPage;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      sp.set("builder_type", "custody");
      if (debouncedSearch) sp.set("search", debouncedSearch);
      sp.set("limit", String(perPage));
      sp.set("offset", String(offset));
      const res = await fetch(`/api/admin/builders?${sp.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset, perPage]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce the search box: apply the term after the user pauses typing and
  // reset to the first page, so each keystroke doesn't fire its own request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / perPage)),
    [total, perPage],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setCreateError("");
    setCreated(false);
    setNewKey("");
    try {
      const res = await fetch("/api/admin/builders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          builder_type: "custody",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setCreated(true);
      setCreateName("");
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function createKey(row: BuilderRow) {
    if (!canManage) return;
    if (!window.confirm(`Issue an API private key for "${row.name}"?`)) return;
    setSavingId(row.id);
    setRowError("");
    setNewKey("");
    setCopiedNewKey(false);
    try {
      const res = await fetch(`/api/admin/builders/${row.id}/api-private-key`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        api_private_key?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setNewKey(data.api_private_key ?? "");
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function revokeKey(row: BuilderRow) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Revoke the API private key for "${row.name}"? Its DPM Wallet will be unable to authenticate until a new key is issued.`,
      )
    )
      return;
    setSavingId(row.id);
    setRowError("");
    setNewKey("");
    try {
      const res = await fetch(
        `/api/admin/builders/${row.id}/api-private-key/revoke`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setRevealedKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  function toggleReveal(id: number) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyRowKey(id: number, key: string) {
    await navigator.clipboard.writeText(key);
    setCopiedRowId(id);
    setTimeout(() => setCopiedRowId((cur) => (cur === id ? null : cur)), 1500);
  }

  async function copyNewKey() {
    await navigator.clipboard.writeText(newKey);
    setCopiedNewKey(true);
    setTimeout(() => setCopiedNewKey(false), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custody builders"
        description="Builders that run their own DPM Wallet and authenticate with a secret API key."
      />

      {canManage && (
        <Card>
          <CardHeader>Onboard custody builder</CardHeader>
          <CardBody className="space-y-4">
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-4">
              <Field label="Name">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </Field>
              <button type="submit" className={buttonVariants.primary} disabled={creating}>
                {creating ? "Creating…" : "Create custody builder"}
              </button>
            </form>
            <p className="text-xs text-foreground-muted">
              A custody builder signs its users out of its own DPM Wallet, so it needs no
              wallet-provider credentials. Issue its API private key from the table below.
            </p>
            {createError && <ErrorMessage>{createError}</ErrorMessage>}
            {created && (
              <InfoMessage>
                Custody builder created. Use “New key” in the table to issue the API private
                key its DPM Wallet authenticates with.
              </InfoMessage>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>Custody builders</CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Search name">
              <input
                className={inputClass}
                data-lpignore="true"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          {rowError && <ErrorMessage>{rowError}</ErrorMessage>}
          {newKey && (
            <InfoMessage>
              <div className="space-y-2">
                <div className="font-medium">
                  API private key issued. Give it to the builder for its DPM Wallet’s
                  RELAYER_BUILDER_API_KEY.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs break-all">{newKey}</code>
                  <button
                    type="button"
                    className={buttonVariants.secondary}
                    onClick={copyNewKey}
                  >
                    {copiedNewKey ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </InfoMessage>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">API private key</th>
                  <th className="py-2 pr-3">Created</th>
                  {canManage && <th className="py-2 pr-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="py-6 text-foreground-muted">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="py-6 text-foreground-muted">
                      No custody builders found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">{row.name}</td>
                      <td className="py-3 pr-3">
                        {row.api_private_key ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs break-all">
                              {revealedKeys.has(row.id)
                                ? row.api_private_key
                                : maskPrivateKey(row.api_private_key)}
                            </code>
                            <button
                              type="button"
                              className={buttonVariants.secondary}
                              onClick={() => toggleReveal(row.id)}
                            >
                              {revealedKeys.has(row.id) ? "Hide" : "Reveal"}
                            </button>
                            {revealedKeys.has(row.id) && (
                              <button
                                type="button"
                                className={buttonVariants.secondary}
                                onClick={() => copyRowKey(row.id, row.api_private_key)}
                              >
                                {copiedRowId === row.id ? "Copied" : "Copy"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-foreground-muted">No active key</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      {canManage && (
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-2">
                            {row.api_private_key ? (
                              <button
                                type="button"
                                className={buttonVariants.danger}
                                disabled={savingId === row.id}
                                onClick={() => revokeKey(row)}
                              >
                                {savingId === row.id ? "Working…" : "Revoke key"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={buttonVariants.secondary}
                                disabled={savingId === row.id}
                                onClick={() => createKey(row)}
                              >
                                {savingId === row.id ? "Working…" : "New key"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-foreground-muted">
            <span className="tabular-nums">
              {total === 0
                ? "No results"
                : `${offset + 1}–${Math.min(offset + perPage, total)} of ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={buttonVariants.secondary}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className={buttonVariants.secondary}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
