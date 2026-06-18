"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RelayerWalletWithdrawDialog } from "@/components/admin/relayer-wallet-withdraw";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  Field,
  PageHeader,
  inputClass,
  selectClass,
  buttonVariants,
} from "@/components/ui";
import type {
  InitRelayerWalletResponse,
  RelayerWallet,
  WalletType,
} from "@/lib/api";

const tableBtn =
  "inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap";
const tableBtnDanger = `${tableBtn} bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15`;
const tableBtnSecondary = `${tableBtn} bg-foreground/5 text-foreground hover:bg-foreground/10 border border-border`;

const SHORT_TYPE: Record<string, string> = {
  TREASURY_ADMIN: "Treasury",
  FEE_ADMIN: "Fee",
  CTF_ADMIN: "CTF",
  UMA_ADMIN: "UMA",
  RELAYER_ADMIN: "Relayer",
  ORACLE_ADMIN: "Oracle",
};

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 3_000;
const FINAL_INIT_STATUSES = new Set(["COMPLETED", "FAILED"]);

const WALLET_TYPES: { value: WalletType; label: string; hint: string }[] = [
  {
    value: "TREASURY_ADMIN",
    label: "Treasury Admin",
    hint: "Granted DEFAULT_ADMIN_ROLE on the Treasury contract.",
  },
  { value: "FEE_ADMIN", label: "Fee Admin", hint: "addAdmin on FeeModule." },
  {
    value: "CTF_ADMIN",
    label: "CTF Exchange Admin",
    hint: "addAdmin on CTFExchange + FeeModule.",
  },
  {
    value: "UMA_ADMIN",
    label: "UMA Admin",
    hint: "Funded with 10k USDC + POL; addAdmin on UmaCtfAdapter + addToWhitelist on OracleWhitelist.",
  },
  {
    value: "RELAYER_ADMIN",
    label: "Relayer",
    hint: "RelayHub stake → depositFor → registerRelay. Needs RELAY_HUB_* envs.",
  },
  {
    value: "ORACLE_ADMIN",
    label: "Oracle Admin",
    hint: "Fund-only — no grant step defined yet.",
  },
];

const typeTone: Record<string, "info" | "accent" | "warning" | "success" | "neutral"> = {
  UMA_ADMIN: "accent",
  RELAYER_ADMIN: "info",
  CTF_ADMIN: "warning",
  FEE_ADMIN: "accent",
  TREASURY_ADMIN: "success",
  ORACLE_ADMIN: "warning",
};

const initStatusTone: Record<string, "warning" | "info" | "success" | "danger"> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  FAILED: "danger",
};

type WalletListResponse = {
  data?: RelayerWallet[];
  total?: number;
  total_pages?: number;
};

export default function InitWalletPage() {
  const [mnemonicExists, setMnemonicExists] = useState<boolean | null>(null);

  const refreshMnemonic = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mnemonic", { cache: "no-store" });
      const data = await res.json();
      setMnemonicExists(res.ok ? Boolean(data.exists) : null);
    } catch {
      setMnemonicExists(null);
    }
  }, []);

  const [type, setType] = useState<WalletType>("TREASURY_ADMIN");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InitRelayerWalletResponse | null>(null);
  const [submitError, setSubmitError] = useState("");

  const [wallets, setWallets] = useState<RelayerWallet[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [filterAddress, setFilterAddress] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterInitStatus, setFilterInitStatus] = useState("");

  const fetchingRef = useRef(false);

  const fetchWallets = useCallback(
    async (pageNum: number, { silent = false }: { silent?: boolean } = {}) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (!silent) setListLoading(true);
      setListError("");
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      });
      if (filterAddress) params.set("address", filterAddress);
      if (filterType) params.set("wallet_type", filterType);
      if (filterLabel) params.set("label", filterLabel);
      try {
        const res = await fetch(`/api/admin/wallets?${params}`, { cache: "no-store" });
        const data = (await res.json()) as WalletListResponse & { error?: string };
        if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
        let rows = data.data ?? [];
        if (filterInitStatus) {
          rows = rows.filter((w) => w.init_status === filterInitStatus);
        }
        setWallets(rows);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 0);
      } catch (err) {
        setListError(err instanceof Error ? err.message : String(err));
      } finally {
        fetchingRef.current = false;
        if (!silent) setListLoading(false);
      }
    },
    [filterAddress, filterType, filterLabel, filterInitStatus],
  );

  useEffect(() => {
    refreshMnemonic();
  }, [refreshMnemonic]);

  useEffect(() => {
    fetchWallets(page);
  }, [fetchWallets, page]);

  useEffect(() => {
    const hasNonFinal = wallets.some(
      (w) => w.init_status && !FINAL_INIT_STATUSES.has(w.init_status),
    );
    if (!hasNonFinal) return;

    const id = setInterval(() => {
      fetchWallets(page, { silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [wallets, page, fetchWallets]);

  function handleSearch() {
    setPage(0);
    fetchWallets(0);
  }

  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedAddress(addr);
      setTimeout(() => setCopiedAddress(null), 1500);
    });
  }
  const [withdrawWallet, setWithdrawWallet] = useState<RelayerWallet | null>(null);

  async function handleDeactivate(w: RelayerWallet) {
    if (
      !confirm(
        `Deactivate wallet ${w.address}?\nIt will no longer be auto-funded or picked up for relaying.`,
      )
    ) {
      return;
    }
    setDeactivatingId(w.id);
    try {
      const res = await fetch(`/api/admin/wallets/${w.id}/deactivate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      fetchWallets(page);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleActivate(w: RelayerWallet) {
    if (!confirm(`Activate wallet ${w.address}?\nIt will be auto-funded and picked up for relaying.`)) {
      return;
    }
    setActivatingId(w.id);
    try {
      const res = await fetch(`/api/admin/wallets/${w.id}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      fetchWallets(page);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setActivatingId(null);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/wallets/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, label: label || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setResult(data);
      refreshMnemonic();
      setPage(0);
      fetchWallets(0);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const selected = WALLET_TYPES.find((t) => t.value === type);

  const liveResultInitStatus = result
    ? (wallets.find((w) => w.id === result.wallet_id)?.init_status ?? result.initStatus)
    : null;

  return (
    <div className="max-w-full">
      <PageHeader
        title="Initialize Wallet"
        description="Derive a fresh wallet from the HD mnemonic and kick off the per-type on-chain init workflow (fund POL, grant roles, etc.). Returns immediately; the table below tracks init_status as the workflow runs."
        actions={
          mnemonicExists === null ? (
            <Badge tone="neutral">Mnemonic: unknown</Badge>
          ) : mnemonicExists ? (
            <Badge tone="success">Mnemonic ready</Badge>
          ) : (
            <Badge tone="warning">Mnemonic missing — create it first</Badge>
          )
        }
      />

      <Card className="mb-8">
        <CardHeader>
          <h2 className="text-sm font-semibold">Initialize a new wallet</h2>
        </CardHeader>
        <CardBody className="space-y-5">
          <Field label="Wallet type" hint={selected?.hint}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {WALLET_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${
                    type === t.value
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-foreground-muted hover:bg-foreground/5"
                  }`}
                >
                  <div className="font-medium text-foreground">{t.label}</div>
                  <div className="mt-0.5 text-xs text-foreground-muted">{t.value}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Label (optional)" htmlFor="wallet-label">
            <input
              id="wallet-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. uma-admin-1"
              className={inputClass}
            />
          </Field>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || mnemonicExists === false}
              className={buttonVariants.primary}
            >
              {submitting ? "Initializing…" : `Initialize ${selected?.label ?? type}`}
            </button>

            {submitError ? <ErrorMessage>{submitError}</ErrorMessage> : null}

            {result ? (
              <div className="rounded-md border border-border p-4 text-sm">
                <h3 className="mb-2 font-medium">Workflow started</h3>
                <dl className="grid grid-cols-[120px_1fr] gap-y-1 font-mono text-xs">
                  <dt className="text-foreground-muted">Address</dt>
                  <dd className="break-all">{result.address}</dd>
                  <dt className="text-foreground-muted">Type</dt>
                  <dd>{result.type}</dd>
                  <dt className="text-foreground-muted">Init status</dt>
                  <dd>
                    <Badge tone={initStatusTone[liveResultInitStatus ?? ""] ?? "neutral"}>
                      {liveResultInitStatus ?? result.initStatus}
                    </Badge>
                  </dd>
                  <dt className="text-foreground-muted">Wallet ID</dt>
                  <dd>{result.wallet_id}</dd>
                  <dt className="text-foreground-muted">Workflow ID</dt>
                  <dd className="break-all">{result.workflow_id}</dd>
                </dl>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Existing wallets{total > 0 ? ` (${total})` : ""}
          </h2>
          <button
            type="button"
            onClick={() => fetchWallets(page)}
            disabled={listLoading}
            className={buttonVariants.secondary}
          >
            {listLoading ? "Refreshing…" : "Refresh"}
          </button>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Address contains…"
              value={filterAddress}
              onChange={(e) => setFilterAddress(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className={`${inputClass} min-w-[180px] flex-1 font-mono text-xs`}
            />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(0);
              }}
              className={`${selectClass} w-auto text-xs`}
            >
              <option value="">All Types</option>
              {WALLET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value}
                </option>
              ))}
            </select>
            <select
              value={filterInitStatus}
              onChange={(e) => {
                setFilterInitStatus(e.target.value);
                setPage(0);
              }}
              className={`${selectClass} w-auto text-xs`}
            >
              <option value="">All Init Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
            </select>
            <input
              placeholder="Label contains…"
              value={filterLabel}
              onChange={(e) => setFilterLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className={`${inputClass} w-40 text-xs`}
            />
            <button type="button" onClick={handleSearch} className={buttonVariants.secondary}>
              Search
            </button>
          </div>

          {listError ? <ErrorMessage>{listError}</ErrorMessage> : null}

          {listLoading && wallets.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">Loading…</p>
          ) : wallets.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              No wallets match the filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-24" />
                  <col className="w-28" />
                  <col className="w-24" />
                  <col className="w-10" />
                  <col className="w-14" />
                  <col className="w-24" />
                  <col className="w-20" />
                  <col className="w-[5.5rem]" />
                </colgroup>
                <thead className="border-b border-border bg-foreground/[0.03]">
                  <tr>
                    {["ID", "Address", "Type", "Init", "Status", "●", "Nonce", "Label", "Created", "Actions"].map(
                      (h) => (
                        <th key={h} className="px-3 py-2 font-medium text-foreground-muted">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {wallets.map((w) => (
                    <tr
                      key={w.id}
                      className="hover:bg-foreground/[0.02]"
                      title={w.init_error ? `Init error: ${w.init_error}` : undefined}
                    >
                      <td className="px-3 py-2 font-mono text-foreground-muted">{w.id}</td>
                      <td className="px-3 py-2 font-mono">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate" title={w.address}>{w.address}</span>
                          <button
                            type="button"
                            onClick={() => copyAddress(w.address)}
                            title={copiedAddress === w.address ? "Copied!" : "Copy address"}
                            className="cursor-pointer text-foreground-muted hover:text-foreground transition-colors"
                          >
                            {copiedAddress === w.address ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-success">
                                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                <path fillRule="evenodd" d="M10.986 3H12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1.014A2.25 2.25 0 0 1 7.25 1.5h1.5a2.25 2.25 0 0 1 2.236 1.5ZM8.75 3a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75v.25h3V3ZM6 6.75A.75.75 0 0 1 6.75 6h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 6 6.75Zm.75 2.75a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span title={w.wallet_type}>
                          <Badge tone={typeTone[w.wallet_type] ?? "neutral"}>
                            {SHORT_TYPE[w.wallet_type] ?? w.wallet_type}
                          </Badge>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={initStatusTone[w.init_status ?? ""] ?? "neutral"}>
                          {w.init_status ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-foreground-muted">{w.status}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            w.is_active ? "bg-success" : "bg-border-strong"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono">{w.current_nonce}</td>
                      <td className="px-3 py-2 text-foreground-muted">{w.label ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground-muted">
                        {w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {w.is_active ? (
                            <button
                              type="button"
                              disabled={deactivatingId === w.id}
                              onClick={() => handleDeactivate(w)}
                              className={tableBtnDanger}
                            >
                              {deactivatingId === w.id ? "…" : "Deactivate"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={activatingId === w.id}
                              onClick={() => handleActivate(w)}
                              className={tableBtnSecondary}
                            >
                              {activatingId === w.id ? "…" : "Activate"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setWithdrawWallet(w)}
                            className={tableBtnSecondary}
                            title={
                              w.is_active
                                ? "Deactivate first — manual withdraws race the relayer pool"
                                : "Withdraw POL or USDC.e from this wallet"
                            }
                          >
                            Withdraw
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground-muted">
                Page {page + 1} of {totalPages} ({total} total)
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page === 0 || listLoading}
                  onClick={() => setPage((p) => p - 1)}
                  className={buttonVariants.secondary}
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1 || listLoading}
                  onClick={() => setPage((p) => p + 1)}
                  className={buttonVariants.secondary}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <RelayerWalletWithdrawDialog
        walletId={withdrawWallet?.id ?? null}
        walletAddress={withdrawWallet?.address}
        isActive={!!withdrawWallet?.is_active}
        open={withdrawWallet != null}
        onClose={() => setWithdrawWallet(null)}
        onWithdrawSuccess={() => fetchWallets(page)}
      />
    </div>
  );
}
