"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  ErrorMessage,
  Field,
  buttonVariants,
  inputClass,
} from "@/components/ui";
import type {
  AssetBalance,
  WalletBalances,
  WithdrawAsset,
  WithdrawPayload,
  WithdrawResult,
} from "@/lib/api";

type Props = {
  walletId: number | null;
  walletAddress?: string;
  isActive: boolean;
  open: boolean;
  onClose: () => void;
  onWithdrawSuccess?: () => void;
};

const statusTone: Record<WithdrawResult["status"], "warning" | "success" | "danger"> = {
  PENDING: "warning",
  MINED: "success",
  REVERTED: "danger",
};

export function RelayerWalletWithdrawDialog({
  walletId,
  walletAddress,
  isActive,
  open,
  onClose,
  onWithdrawSuccess,
}: Props) {
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const [asset, setAsset] = useState<WithdrawAsset>("POL");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [useMax, setUseMax] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [result, setResult] = useState<WithdrawResult | null>(null);

  const refresh = useCallback(async () => {
    if (walletId == null) return;
    setLoadingBalances(true);
    setBalanceError("");
    try {
      const res = await fetch(`/api/admin/wallets/${walletId}/balances`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setBalances(data);
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingBalances(false);
    }
  }, [walletId]);

  useEffect(() => {
    if (!open || walletId == null) return;
    setResult(null);
    setWithdrawError("");
    setTo("");
    setAmount("");
    setUseMax(false);
    setAsset("POL");
    refresh();
  }, [open, walletId, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const selected: AssetBalance | undefined =
    asset === "POL" ? balances?.pol : balances?.collateral;

  async function handleSubmit() {
    if (walletId == null) return;
    if (!to.trim()) {
      setWithdrawError("destination address is required");
      return;
    }
    const payload: WithdrawPayload = { asset, to: to.trim() };
    if (useMax) {
      payload.max = true;
    } else {
      if (!selected) {
        setWithdrawError("balances not loaded");
        return;
      }
      const raw = humanToRaw(amount, selected.decimals);
      if (raw == null) {
        setWithdrawError(`invalid amount; use decimals up to ${selected.decimals} places`);
        return;
      }
      payload.amount_raw = raw;
    }

    setSubmitting(true);
    setWithdrawError("");
    setResult(null);
    try {
      const res = await fetch(`/api/admin/wallets/${walletId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setResult(data);
      refresh();
      onWithdrawSuccess?.();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Withdraw from relayer wallet"
    >
      <div className="flex-1 bg-foreground/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="w-full sm:w-[32rem] h-full bg-background border-l border-border shadow-xl overflow-y-auto">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur px-5 py-4 border-b border-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Withdraw from relayer wallet</h3>
            {walletAddress ? (
              <p className="mt-1 text-xs font-mono text-foreground-muted break-all">
                {walletAddress}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground p-1 rounded-md hover:bg-foreground/5 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          {isActive ? (
            <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
              This wallet is currently <strong>active</strong>. Deactivate it
              first — the relayer pool manages its nonce, and a manual withdraw
              will race the broadcast pipeline.
            </div>
          ) : null}

          <div className="rounded-md border border-border p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Balances</span>
              <button
                type="button"
                onClick={refresh}
                disabled={loadingBalances || walletId == null}
                className={buttonVariants.ghost}
              >
                {loadingBalances ? "…" : "Refresh"}
              </button>
            </div>
            {balanceError ? <ErrorMessage>{balanceError}</ErrorMessage> : null}
            {balances ? (
              <dl className="grid grid-cols-[110px_1fr] gap-y-1 font-mono">
                <dt className="text-foreground-muted">POL</dt>
                <dd>
                  {balances.pol.balance_normalized}{" "}
                  <span className="text-foreground-muted">
                    (max: {formatMaxHuman(balances.pol)})
                  </span>
                </dd>
                <dt className="text-foreground-muted">USDC.e</dt>
                <dd>
                  {balances.collateral.balance_normalized}{" "}
                  <span className="text-foreground-muted">
                    (max: {formatMaxHuman(balances.collateral)})
                  </span>
                </dd>
                <dt className="text-foreground-muted">Gas reserve</dt>
                <dd className="text-foreground-muted">
                  {weiToHuman(balances.gas.pol_gas_reservation_wei, 18)} POL @{" "}
                  {balances.gas.pol_transfer_gas_limit} gas ·{" "}
                  {gweiFromWei(balances.gas.max_fee_per_gas)} gwei max fee
                </dd>
              </dl>
            ) : (
              <p className="text-foreground-muted">{loadingBalances ? "Loading…" : "—"}</p>
            )}
          </div>

          <Field label="Asset">
            <div className="grid grid-cols-2 gap-2">
              {(["POL", "COLLATERAL"] as WithdrawAsset[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAsset(a);
                    setUseMax(false);
                    setAmount("");
                  }}
                  className={`rounded-md border p-2 text-left text-xs transition-colors ${
                    asset === a
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-foreground-muted hover:bg-foreground/5"
                  }`}
                >
                  <span className="font-medium">
                    {a === "POL" ? "POL (native)" : "USDC.e (collateral)"}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Destination address" htmlFor="withdraw-to">
            <input
              id="withdraw-to"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="0x…"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <Field
            label="Amount"
            hint={
              asset === "COLLATERAL"
                ? "Gas for the ERC-20 transfer is paid in POL — the wallet needs at least the gas reserve in POL above."
                : `Max nets a ${
                    balances ? gweiFromWei(balances.gas.max_fee_per_gas) : "—"
                  } gwei × 21k gas reserve so the broadcast won't fail on a base-fee bump.`
            }
          >
            <div className="flex gap-2">
              <input
                value={useMax ? `MAX — ${formatMaxHuman(selected)}` : amount}
                onChange={(e) => {
                  setUseMax(false);
                  setAmount(e.target.value.trim());
                }}
                placeholder={selected ? `up to ${formatMaxHuman(selected)}` : ""}
                className={`${inputClass} font-mono text-xs`}
                disabled={useMax}
              />
              <button
                type="button"
                onClick={() => {
                  setUseMax((v) => !v);
                  if (!useMax) setAmount("");
                }}
                disabled={!selected}
                className={buttonVariants.secondary}
              >
                {useMax ? "Clear" : "Max"}
              </button>
            </div>
          </Field>

          {withdrawError ? <ErrorMessage>{withdrawError}</ErrorMessage> : null}

          {result ? (
            <div className="rounded-md border border-border p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Withdraw broadcast</span>
                <Badge tone={statusTone[result.status]}>{result.status}</Badge>
              </div>
              <dl className="grid grid-cols-[80px_1fr] gap-y-1 font-mono">
                <dt className="text-foreground-muted">Tx</dt>
                <dd className="break-all">{result.tx_hash}</dd>
                <dt className="text-foreground-muted">Nonce</dt>
                <dd>{result.nonce}</dd>
                <dt className="text-foreground-muted">Amount</dt>
                <dd>{result.amount_raw}</dd>
                {result.block_number ? (
                  <>
                    <dt className="text-foreground-muted">Block</dt>
                    <dd>{result.block_number}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={buttonVariants.secondary}>
              Close
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || isActive || !balances || !to || (!useMax && !amount)}
              className={buttonVariants.primary}
            >
              {submitting ? "Broadcasting…" : "Withdraw"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function formatMaxHuman(b: AssetBalance | undefined): string {
  if (!b) return "—";
  return normalizeBigIntToHuman(b.max_withdrawable_raw, b.decimals);
}

function normalizeBigIntToHuman(raw: string, decimals: number): string {
  if (!raw) return "0";
  try {
    const ZERO = BigInt(0);
    const TEN = BigInt(10);
    const bi = BigInt(raw);
    if (bi === ZERO) return "0";
    const neg = bi < ZERO;
    const abs = neg ? -bi : bi;
    const base = TEN ** BigInt(decimals);
    const whole = abs / base;
    const frac = abs % base;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    const out = fracStr ? `${whole}.${fracStr}` : whole.toString();
    return neg ? `-${out}` : out;
  } catch {
    return raw;
  }
}

function weiToHuman(wei: string, decimals: number): string {
  return normalizeBigIntToHuman(wei, decimals);
}

function gweiFromWei(wei: string): string {
  try {
    return (BigInt(wei) / BigInt(1_000_000_000)).toString();
  } catch {
    return "?";
  }
}

// humanToRaw converts a decimal string like "1.25" into integer base-units
// ("1250000000000000000" for 18 decimals). Returns null on bad input or when
// the fraction has more digits than `decimals`.
function humanToRaw(s: string, decimals: number): string | null {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  const fracPadded = frac.padEnd(decimals, "0");
  const combined = (whole + fracPadded).replace(/^0+/, "") || "0";
  try {
    return BigInt(combined).toString();
  } catch {
    return null;
  }
}
