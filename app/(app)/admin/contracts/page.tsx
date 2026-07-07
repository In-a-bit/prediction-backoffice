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
import type { Contract } from "@/lib/api";
import { getKnownContracts } from "@/lib/known-contracts";

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
            onClick={fetchContracts}
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
                    {["ID", "Name", "Address", "Type", "Created"].map((h) => (
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
                      <td className="px-3 py-2 font-mono break-all">{c.address}</td>
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
