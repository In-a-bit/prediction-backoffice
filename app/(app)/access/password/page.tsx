"use client";

import { useState } from "react";

import { buttonVariants, Field, inputClass, PageHeader } from "@/components/ui";

import { changeOwnPassword } from "../actions";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    if (next.length < 12) {
      setError("New password must be at least 12 characters");
      return;
    }
    setBusy(true);
    const res = await changeOwnPassword(current, next);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to change password");
      return;
    }
    setDone(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <div className="max-w-md">
      <PageHeader title="Change password" />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Current password" htmlFor="cur" required>
          <input id="cur" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="new" hint="At least 12 characters." required>
          <input id="new" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="conf" required>
          <input id="conf" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error ? (
          <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2" role="alert">
            {error}
          </div>
        ) : null}
        {done ? (
          <div className="text-sm text-success bg-success/10 border border-success/20 rounded-md px-3 py-2">
            Password changed.
          </div>
        ) : null}
        <button type="submit" disabled={busy} className={`${buttonVariants.primary} self-start`}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
