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

type ListResponse = {
  data: BuilderRow[];
  total: number;
  limit: number;
  offset: number;
};

export default function BuildersPage() {
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
  const [createPublicKey, setCreatePublicKey] = useState("");
  const [createSecretKey, setCreateSecretKey] = useState("");
  const [createVerificationKey, setCreateVerificationKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const offset = (page - 1) * perPage;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
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
    setCreatedKey("");
    setCopied(false);
    try {
      const res = await fetch("/api/admin/builders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          wallet_public_key: createPublicKey.trim(),
          wallet_secret_key: createSecretKey.trim(),
          wallet_verification_key: createVerificationKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { api_public_key?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setCreatedKey(data.api_public_key ?? "");
      setCreateName("");
      setCreatePublicKey("");
      setCreateSecretKey("");
      setCreateVerificationKey("");
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Builders"
        description="Onboard builders and issue their API keys."
      />

      {canManage && (
        <Card>
          <CardHeader>Onboard builder</CardHeader>
          <CardBody className="space-y-4">
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Wallet public key (Privy app id)">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  value={createPublicKey}
                  onChange={(e) => setCreatePublicKey(e.target.value)}
                  required
                />
              </Field>
              <Field label="Wallet secret key (Privy app secret)">
                <input
                  className={inputClass}
                  data-lpignore="true"
                  type="password"
                  value={createSecretKey}
                  onChange={(e) => setCreateSecretKey(e.target.value)}
                  required
                />
              </Field>
              <Field label="Wallet verification key (PEM, optional)">
                <textarea
                  className={`${inputClass} min-h-[80px] font-mono text-xs`}
                  value={createVerificationKey}
                  onChange={(e) => setCreateVerificationKey(e.target.value)}
                />
              </Field>
              <div className="flex items-end md:col-span-2">
                <button type="submit" className={buttonVariants.primary} disabled={creating}>
                  {creating ? "Creating…" : "Create builder"}
                </button>
              </div>
            </form>
            {createError && <ErrorMessage>{createError}</ErrorMessage>}
            {createdKey && (
              <InfoMessage>
                <div className="space-y-2">
                  <div className="font-medium">
                    Builder onboarded. Give this API key to the builder — it is shown only once.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs break-all">{createdKey}</code>
                    <button
                      type="button"
                      className={buttonVariants.secondary}
                      onClick={() => copyKey(createdKey)}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </InfoMessage>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>Builders</CardHeader>
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

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Wallet type</th>
                  <th className="py-2 pr-3">Wallet public key</th>
                  <th className="py-2 pr-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-foreground-muted">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-foreground-muted">
                      No builders found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">{row.name}</td>
                      <td className="py-3 pr-3">{row.wallet_type}</td>
                      <td className="py-3 pr-3">
                        <code className="text-xs break-all">{row.wallet_public_key}</code>
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        {new Date(row.created_at).toLocaleString()}
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
