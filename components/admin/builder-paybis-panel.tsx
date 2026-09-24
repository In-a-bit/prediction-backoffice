"use client";

import { useState } from "react";

import {
  ErrorMessage,
  Field,
  buttonVariants,
  inputClass,
  textareaClass,
} from "@/components/ui";
import type { BuilderRow } from "@/lib/api";
import type { PaybisField } from "@/lib/builders";

type Credential = {
  field: PaybisField;
  label: string;
  hint: string;
  multiline: boolean;
};

const CREDENTIALS: Credential[] = [
  {
    field: "paybis_api_key",
    label: "API key",
    hint: "Bearer token for this builder's Paybis account.",
    multiline: false,
  },
  {
    field: "paybis_private_key",
    label: "Our private key",
    hint: "PEM. Signs our outgoing requests; Paybis holds the public half.",
    multiline: true,
  },
  {
    field: "paybis_provider_public_key",
    label: "Provider public key",
    hint: "PEM. Paybis's own key, used to verify their webhooks.",
    multiline: true,
  },
];

// paybisSummary reports how much of the Paybis setup a builder has, for the
// collapsed table cell. A partial setup still fails, so it reads as its own
// state rather than as configured.
export function paybisSummary(row: BuilderRow) {
  const set = CREDENTIALS.filter((cred) => row[cred.field]);
  if (set.length === CREDENTIALS.length) return "Configured";
  if (set.length === 0) return "Not set";
  return `Partial: ${set.map((cred) => cred.label.toLowerCase()).join(", ")}`;
}

// confirmReplace guards an overwrite. The stored credential is live, so a bad
// paste breaks this builder's ramp until the right one is pasted again.
function confirmReplace(row: BuilderRow, cred: Credential) {
  if (!row[cred.field]) return true;
  return window.confirm(
    `Replace the stored Paybis ${cred.label.toLowerCase()} for "${row.name}"?`,
  );
}

async function patchCredential(id: number, field: PaybisField, value: string) {
  const res = await fetch(`/api/admin/builders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
}

function SecretValue({
  value,
  revealed,
  copied,
  onToggle,
  onCopy,
}: {
  value: string;
  revealed: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  if (!value) return <span className="text-xs text-foreground-muted">Not set</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-xl text-xs break-all">
        {revealed ? value : "•".repeat(16)}
      </code>
      <button type="button" className={buttonVariants.secondary} onClick={onToggle}>
        {revealed ? "Hide" : "Reveal"}
      </button>
      {revealed && (
        <button type="button" className={buttonVariants.secondary} onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

function CredentialInput({
  cred,
  id,
  draft,
  stored,
  onChange,
}: {
  cred: Credential;
  id: string;
  draft: string;
  stored: boolean;
  onChange: (value: string) => void;
}) {
  const placeholder = stored ? "Paste a replacement" : "Paste to set";
  if (cred.multiline) {
    return (
      <textarea
        id={id}
        className={`${textareaClass} min-h-[64px]`}
        autoComplete="off"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      id={id}
      className={inputClass}
      data-lpignore="true"
      type="password"
      autoComplete="off"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// BuilderPaybisPanel edits one builder's Paybis credentials. Drafts live here
// rather than on the page so typing re-renders this row alone, and each
// credential saves on its own because dpm-api patches them independently.
export function BuilderPaybisPanel({
  row,
  canManage,
  onSaved,
}: {
  row: BuilderRow;
  canManage: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<PaybisField, string>>>({});
  const [saving, setSaving] = useState<PaybisField | null>(null);
  const [revealed, setRevealed] = useState<Set<PaybisField>>(new Set());
  const [copied, setCopied] = useState<PaybisField | null>(null);
  const [error, setError] = useState("");

  function toggleReveal(field: PaybisField) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function copyValue(field: PaybisField, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    setTimeout(() => setCopied((cur) => (cur === field ? null : cur)), 1500);
  }

  async function save(cred: Credential) {
    const value = (drafts[cred.field] ?? "").trim();
    if (!value || !confirmReplace(row, cred)) return;
    setSaving(cred.field);
    setError("");
    try {
      await patchCredential(row.id, cred.field, value);
      setDrafts((prev) => ({ ...prev, [cred.field]: "" }));
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="grid gap-4 md:grid-cols-3">
        {CREDENTIALS.map((cred) => {
          const stored = row[cred.field] ?? "";
          const inputId = `builder-${row.id}-${cred.field}`;
          return (
            <div key={cred.field} className="space-y-2">
              <Field label={cred.label} hint={cred.hint} htmlFor={inputId}>
                <SecretValue
                  value={stored}
                  revealed={revealed.has(cred.field)}
                  copied={copied === cred.field}
                  onToggle={() => toggleReveal(cred.field)}
                  onCopy={() => copyValue(cred.field, stored)}
                />
              </Field>
              {canManage && (
                <>
                  <CredentialInput
                    cred={cred}
                    id={inputId}
                    draft={drafts[cred.field] ?? ""}
                    stored={Boolean(stored)}
                    onChange={(value) =>
                      setDrafts((prev) => ({ ...prev, [cred.field]: value }))
                    }
                  />
                  <button
                    type="button"
                    className={buttonVariants.secondary}
                    disabled={
                      saving === cred.field || !(drafts[cred.field] ?? "").trim()
                    }
                    onClick={() => save(cred)}
                  >
                    {saving === cred.field ? "Saving…" : "Save"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
