"use client";

import { useCallback, useEffect, useState } from "react";

import { useCan } from "@/components/auth/permission-context";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  InfoMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import type { AddressBalance, Contract } from "@/lib/api";
import { addressUrl } from "@/lib/explorer";
import { getKnownContracts } from "@/lib/known-contracts";

// Contract rows never change type after creation, so the treasury contract's
// address is the only one we ever need to read a live balance for.
const TREASURY_CONTRACT_TYPE = "treasury";

const {
  contracts: KNOWN_CONTRACTS,
  isDefault: KNOWN_CONTRACTS_ARE_TESTNET,
  error: KNOWN_CONTRACTS_ERROR,
} = getKnownContracts();

const typeTone: Record<string, "info" | "accent" | "warning" | "success" | "neutral"> = {
  usdc_e: "info",
  conditional_tokens: "accent",
  ctf_exchange: "warning",
  fee_module: "accent",
  uma_ctf_adapter: "success",
  managed_oracle: "info",
  ctf_oracle: "warning",
  treasury: "success",
  relay_hub: "neutral",
};

export default function ContractsPage() {
  const canAdmin = useCan("wallets.admin");

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [adding, setAdding] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const [treasuryBalances, setTreasuryBalances] = useState<{
    pol: AddressBalance;
    usdc: AddressBalance;
  } | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState("");

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/contracts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setContracts(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const treasuryAddress = contracts.find(
    (c) => c.contract_type === TREASURY_CONTRACT_TYPE,
  )?.address;

  const fetchTreasuryBalances = useCallback(async (address: string) => {
    setBalancesLoading(true);
    setBalancesError("");
    try {
      const res = await fetch(
        `/api/admin/contracts/balance?address=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setTreasuryBalances(data);
    } catch (err) {
      setBalancesError(err instanceof Error ? err.message : String(err));
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (treasuryAddress) fetchTreasuryBalances(treasuryAddress);
  }, [treasuryAddress, fetchTreasuryBalances]);

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedAddress(addr);
      setTimeout(() => setCopiedAddress(null), 1500);
    });
  }

  const existingAddresses = new Set(contracts.map((c) => c.address?.toLowerCase()));
  const missingContracts = KNOWN_CONTRACTS.filter(
    (kc) => !existingAddresses.has(kc.address.toLowerCase()),
  );

  async function addOne(contract: (typeof KNOWN_CONTRACTS)[number]): Promise<boolean> {
    const res = await fetch("/api/admin/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contract),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? `Status ${res.status}`);
    }
    return true;
  }

  async function handleAdd(contract: (typeof KNOWN_CONTRACTS)[number]) {
    setAdding(contract.address);
    setAddError("");
    setAddSuccess("");
    try {
      await addOne(contract);
      setAddSuccess(`Added ${contract.name}`);
      await fetchContracts();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(null);
    }
  }

  async function handleAddAll() {
    setBulkAdding(true);
    setAddError("");
    setAddSuccess("");
    let added = 0;
    try {
      for (const contract of missingContracts) {
        await addOne(contract);
        added++;
      }
      setAddSuccess(`Added ${added} contract${added === 1 ? "" : "s"}`);
    } catch (err) {
      setAddError(
        `Added ${added}, then failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await fetchContracts();
      setBulkAdding(false);
    }
  }

  return (
    <div className="max-w-full">
      <PageHeader
        title="Contracts"
        description="Register the on-chain infrastructure contracts (collateral, CTF, exchanges, oracles, treasury) in the dpm-api registry. Bulk-add any that are missing or inspect what's already known."
        actions={
          <div className="flex items-center gap-2">
            {KNOWN_CONTRACTS_ERROR ? (
              <Badge tone="danger">Contracts env misconfigured</Badge>
            ) : KNOWN_CONTRACTS_ARE_TESTNET ? (
              <span title="Using built-in Polygon Amoy testnet addresses. Set the NEXT_PUBLIC_CONTRACT_* env vars to override for production.">
                <Badge tone="warning">Testnet defaults — override in prod</Badge>
              </span>
            ) : (
              <Badge tone="neutral">Env override</Badge>
            )}
            {canAdmin ? (
              <Badge tone="success">Wallet admin</Badge>
            ) : (
              <Badge tone="warning">Read-only</Badge>
            )}
          </div>
        }
      />

      {KNOWN_CONTRACTS_ERROR ? (
        <div className="mb-8">
          <ErrorMessage>{KNOWN_CONTRACTS_ERROR}</ErrorMessage>
        </div>
      ) : null}

      {missingContracts.length > 0 && canAdmin ? (
        <Card className="mb-8">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add contracts</h2>
            <button
              type="button"
              onClick={handleAddAll}
              disabled={bulkAdding || adding !== null}
              className={buttonVariants.secondary}
            >
              {bulkAdding ? "Adding…" : `Add all (${missingContracts.length})`}
            </button>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-foreground-muted">
              These contracts are not yet in the registry. Add individually or use “Add all”.
            </p>
            <div className="space-y-2">
              {missingContracts.map((kc) => (
                <div
                  key={kc.address}
                  className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{kc.name}</span>
                      <Badge tone={typeTone[kc.contract_type] ?? "neutral"}>
                        {kc.contract_type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-foreground-muted">
                      {kc.address}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(kc)}
                    disabled={adding !== null || bulkAdding}
                    className={buttonVariants.secondary}
                  >
                    {adding === kc.address ? "Adding…" : "Add"}
                  </button>
                </div>
              ))}
            </div>
            {addError ? <ErrorMessage>{addError}</ErrorMessage> : null}
            {addSuccess ? <InfoMessage>{addSuccess}</InfoMessage> : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Registered contracts{contracts.length > 0 ? ` (${contracts.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={() => {
              fetchContracts();
              if (treasuryAddress) fetchTreasuryBalances(treasuryAddress);
            }}
            disabled={loading}
            className={buttonVariants.secondary}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </CardHeader>
        <CardBody className="space-y-3">
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}

          {loading && contracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">Loading…</p>
          ) : contracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              No contracts registered yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-foreground/[0.03]">
                  <tr>
                    {["ID", "Name", "Address", "Balance", "Type", "Created"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-foreground-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-foreground/[0.02]">
                      <td className="px-3 py-2 font-mono text-foreground-muted">{c.id}</td>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 font-mono">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="break-all">{c.address}</span>
                          <button
                            type="button"
                            onClick={() => copyAddress(c.address)}
                            title={copiedAddress === c.address ? "Copied!" : "Copy address"}
                            className="shrink-0 cursor-pointer text-foreground-muted hover:text-foreground transition-colors"
                          >
                            {copiedAddress === c.address ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-success">
                                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                <path fillRule="evenodd" d="M10.986 3H12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1.014A2.25 2.25 0 0 1 7.25 1.5h1.5a2.25 2.25 0 0 1 2.236 1.5ZM8.75 3a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75v.25h3V3ZM6 6.75A.75.75 0 0 1 6.75 6h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 6 6.75Zm.75 2.75a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                          <a
                            href={addressUrl(c.address)}
                            target="_blank"
                            rel="noreferrer"
                            title="View on explorer"
                            className="shrink-0 cursor-pointer text-foreground-muted hover:text-foreground transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 .75.75h6a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 10.25 14.5h-6A2.25 2.25 0 0 1 2 12.25v-6A2.25 2.25 0 0 1 4.25 4h4a.75.75 0 0 1 0 1.5h-4Z" clipRule="evenodd" />
                              <path fillRule="evenodd" d="M6.194 9.806a.75.75 0 0 0 1.06 0l6.246-6.246v2.19a.75.75 0 0 0 1.5 0v-4a.75.75 0 0 0-.75-.75h-4a.75.75 0 0 0 0 1.5h2.19L6.194 8.746a.75.75 0 0 0 0 1.06Z" clipRule="evenodd" />
                            </svg>
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {c.contract_type === TREASURY_CONTRACT_TYPE ? (
                          <TreasuryBalanceCell
                            balances={treasuryBalances}
                            loading={balancesLoading}
                            error={balancesError}
                          />
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={typeTone[c.contract_type] ?? "neutral"}>
                          {c.contract_type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-foreground-muted">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && contracts.length > 0 && missingContracts.length === 0 ? (
            <p className="text-center text-xs text-success">All known contracts are registered.</p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

// TreasuryBalanceCell shows the Treasury contract's live on-chain POL +
// USDC.e balances — the only contract whose own address actually holds
// funds, so it's the only row this column is populated for.
function TreasuryBalanceCell({
  balances,
  loading,
  error,
}: {
  balances: { pol: AddressBalance; usdc: AddressBalance } | null;
  loading: boolean;
  error: string;
}) {
  if (loading && !balances) {
    return <span className="text-foreground-muted">Loading…</span>;
  }
  if (error) {
    return (
      <span className="text-danger" title={error}>
        Error
      </span>
    );
  }
  if (!balances) {
    return <span className="text-foreground-muted">—</span>;
  }
  // Label column is fixed-width so both amounts start at the same x
  // position — sized to "USDC", the longer of the two labels, so "POL"
  // right-pads up to it instead of the amounts drifting out of alignment.
  return (
    <div className="flex flex-col gap-0.5 text-xs font-mono">
      <div className="flex gap-1.5">
        <span className="w-9 shrink-0 text-foreground-muted">POL</span>
        <span>{balances.pol.balance_normalized}</span>
      </div>
      <div className="flex gap-1.5">
        <span className="w-9 shrink-0 text-foreground-muted">USDC</span>
        <span>{balances.usdc.balance_normalized}</span>
      </div>
    </div>
  );
}
