"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  PageHeader,
  Stat,
  buttonVariants,
} from "@/components/ui";
import type { MnemonicStatus } from "@/lib/api";

export default function MnemonicPage() {
  const [status, setStatus] = useState<MnemonicStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [initing, setIniting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/mnemonic", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleInit() {
    setIniting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/mnemonic/init", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIniting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="HD Mnemonic"
        description="Manage the singleton mnemonic used to derive every newly-initialized relayer wallet. The plaintext is never returned by the API — only the existence flag, the highest derivation index allocated so far, and the creation timestamp."
      />

      <Card className="mb-6">
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Status</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className={buttonVariants.secondary}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </CardHeader>
        <CardBody>
          {status ? (
            <div className="flex flex-wrap gap-8">
              <Stat
                label="Exists"
                value={status.exists ? "Yes" : "No"}
                tone={status.exists ? "success" : "neutral"}
              />
              <Stat label="Max used index" value={status.max_used_index} />
              {status.created_at ? (
                <Stat
                  label="Created"
                  value={
                    <span className="text-sm font-mono">
                      {new Date(status.created_at).toLocaleString()}
                    </span>
                  }
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">No data.</p>
          )}
        </CardBody>
      </Card>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleInit}
          disabled={initing || status?.exists === true}
          className={buttonVariants.primary}
          title={
            status?.exists
              ? "Mnemonic already exists. This action is one-shot."
              : "Create the singleton mnemonic"
          }
        >
          {initing
            ? "Creating…"
            : status?.exists
              ? "Mnemonic already exists"
              : "Create mnemonic"}
        </button>
        <p className="text-xs text-foreground-muted">
          Idempotent on the server — clicking when the row already exists is a
          no-op. The button is disabled once Exists=Yes to keep the UI clear.
        </p>
        {status?.exists ? (
          <Badge tone="success">Ready — wallets can be initialized</Badge>
        ) : null}
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </div>
    </div>
  );
}
