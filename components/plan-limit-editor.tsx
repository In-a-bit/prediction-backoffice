"use client";

import { useState, useTransition } from "react";

import { updateTaskAction } from "@/lib/actions";

export function PlanLimitEditor({
  taskId,
  field,
  value,
}: {
  taskId: number;
  field: "parallel_plans" | "max_paused_plans";
  value: number;
}) {
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(String(value));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDirty = parseInt(draft, 10) !== current;
  const isValid = /^\d+$/.test(draft) && parseInt(draft, 10) >= 1;

  function save() {
    if (!isValid || !isDirty) return;
    const next = parseInt(draft, 10);
    setError(null);
    startTransition(async () => {
      const res = await updateTaskAction(taskId, { [field]: next });
      if (res.ok) {
        setCurrent(next);
      } else {
        setDraft(String(current));
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="w-16 rounded border border-border bg-surface px-2 py-0.5 text-sm text-right disabled:opacity-50"
      />
      {isDirty && isValid && (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-xs text-accent hover:underline disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      )}
      {error ? (
        <span className="text-xs text-danger truncate max-w-[12rem]" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
