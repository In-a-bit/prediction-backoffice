"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCan } from "@/components/auth/permission-context";
import {
  Badge,
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
import type { LiquidityProviderRow } from "@/lib/api";

const DEFAULT_PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 300;

type ListResponse = {
  data: LiquidityProviderRow[];
  total: number;
  limit: number;
  offset: number;
};

export default function LiquidityProvidersPage() {
  const canManage = useCan("liquidity_providers.manage");

  const [rows, setRows] = useState<LiquidityProviderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createMax, setCreateMax] = useState("100");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdKey, setCreatedKey] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editMax, setEditMax] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState("");
  const [newKey, setNewKey] = useState("");

  const offset = (page - 1) * perPage;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (debouncedSearch) sp.set("search", debouncedSearch);
      sp.set("limit", String(perPage));
      sp.set("offset", String(offset));
      const res = await fetch(`/api/admin/liquidity-providers?${sp.toString()}`, {
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
    setCreatedKey("");
    try {
      const res = await fetch("/api/admin/liquidity-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          email: createEmail.trim(),
          max_addresses: Number.parseInt(createMax, 10) || 100,
        }),
      });
      const data = (await res.json()) as LiquidityProviderRow & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setCreatedKey(data.private_api_key ?? "");
      setCreateName("");
      setCreateEmail("");
      setCreateMax("100");
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(row: LiquidityProviderRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditEmail(row.email);
    setEditMax(String(row.max_addresses));
    setRowError("");
  }

  async function saveEdit(id: number) {
    const maxAddresses = Number.parseInt(editMax, 10);
    if (!Number.isFinite(maxAddresses) || maxAddresses < 1) {
      setRowError("Max addresses must be at least 1");
      return;
    }
    setSavingId(id);
    setRowError("");
    try {
      const res = await fetch(`/api/admin/liquidity-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          max_addresses: maxAddresses,
        }),
      });
      const data = (await res.json()) as LiquidityProviderRow & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setEditingId(null);
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(row: LiquidityProviderRow) {
    if (!canManage) return;
    setSavingId(row.id);
    setRowError("");
    try {
      const res = await fetch(`/api/admin/liquidity-providers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function createKey(row: LiquidityProviderRow) {
    if (!canManage) return;
    if (!window.confirm(`Issue a new API key for "${row.name}"?`)) return;
    setSavingId(row.id);
    setRowError("");
    setNewKey("");
    try {
      const res = await fetch(
        `/api/admin/liquidity-providers/${row.id}/api-keys`,
        { method: "POST" },
      );
      const data = (await res.json()) as LiquidityProviderRow & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setNewKey(data.private_api_key ?? "");
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function revokeKey(row: LiquidityProviderRow) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Revoke the API key for "${row.name}"? It will be unable to authenticate until a new key is issued.`,
      )
    )
      return;
    setSavingId(row.id);
    setRowError("");
    try {
      const res = await fetch(
        `/api/admin/liquidity-providers/${row.id}/api-keys/revoke`,
        { method: "PATCH" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function copyKey(key: string, rowId?: number) {
    await navigator.clipboard.writeText(key);
    if (rowId === undefined) return;
    setCopiedId(rowId);
    setTimeout(() => setCopiedId((id) => (id === rowId ? null : id)), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Liquidity Providers"
        description="Manage LP providers, API keys, and address limits."
      />

      {canManage && (
        <Card>
          <CardHeader>Create provider</CardHeader>
          <CardBody>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-4">
              <Field label="Name">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Max addresses">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  type="number"
                  min={1}
                  value={createMax}
                  onChange={(e) => setCreateMax(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <button type="submit" className={buttonVariants.primary} disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
            {createError && <ErrorMessage>{createError}</ErrorMessage>}
            {createdKey && (
              <InfoMessage>
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    Private API key (shown once):{" "}
                    <code className="text-xs break-all">{createdKey}</code>
                  </span>
                  <button
                    type="button"
                    className={buttonVariants.secondary}
                    onClick={() => copyKey(createdKey)}
                  >
                    Copy
                  </button>
                </div>
              </InfoMessage>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>Providers</CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Search name or email">
              <input
                className={inputClass}
                data-lpignore="true"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          {rowError && <ErrorMessage>{rowError}</ErrorMessage>}
          {newKey && (
            <InfoMessage>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  New private API key (shown once):{" "}
                  <code className="text-xs break-all">{newKey}</code>
                </span>
                <button
                  type="button"
                  className={buttonVariants.secondary}
                  onClick={() => copyKey(newKey)}
                >
                  Copy
                </button>
              </div>
            </InfoMessage>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Private key</th>
                  <th className="py-2 pr-3">Max</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-foreground-muted">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-foreground-muted">
                      No providers found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">
                        {editingId === row.id ? (
                          <input
                            className={inputClass}
                            data-lpignore="true"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {editingId === row.id ? (
                          <input
                            className={inputClass}
                            data-lpignore="true"
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                          />
                        ) : (
                          row.email
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {row.private_api_key ? (
                          <div className="flex items-center gap-2">
                            <code className="text-xs break-all">{row.private_api_key}</code>
                            <button
                              type="button"
                              title="Copy key"
                              aria-label="Copy key"
                              className="shrink-0 text-foreground-muted transition-colors hover:text-foreground"
                              onClick={() => copyKey(row.private_api_key ?? "", row.id)}
                            >
                              {copiedId === row.id ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        {editingId === row.id ? (
                          <input
                            className={inputClass}
                            data-lpignore="true"
                            type="number"
                            min={1}
                            value={editMax}
                            onChange={(e) => setEditMax(e.target.value)}
                          />
                        ) : (
                          row.max_addresses
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={row.is_active ? "success" : "neutral"}>
                          {row.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        {canManage && (
                          <div className="flex flex-wrap gap-2">
                            {editingId === row.id ? (
                              <>
                                <button
                                  type="button"
                                  className={buttonVariants.primary}
                                  disabled={savingId === row.id}
                                  onClick={() => saveEdit(row.id)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className={buttonVariants.secondary}
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={buttonVariants.secondary}
                                onClick={() => startEdit(row)}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              className={buttonVariants.secondary}
                              disabled={savingId === row.id}
                              onClick={() => toggleActive(row)}
                            >
                              {row.is_active ? "Deactivate" : "Activate"}
                            </button>
                            {!row.private_api_key && (
                              <button
                                type="button"
                                className={buttonVariants.secondary}
                                disabled={savingId === row.id}
                                onClick={() => createKey(row)}
                              >
                                New key
                              </button>
                            )}
                            {row.private_api_key && (
                              <button
                                type="button"
                                className={buttonVariants.danger}
                                disabled={savingId === row.id}
                                onClick={() => revokeKey(row)}
                              >
                                Revoke key
                              </button>
                            )}
                          </div>
                        )}
                      </td>
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

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-success"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
