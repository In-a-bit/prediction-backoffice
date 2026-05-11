"use client";

import { useState, useTransition } from "react";

import { updateTaskAction } from "@/lib/actions";

type Field = "is_create_active" | "is_resolve_active";

export function TaskToggle({
  taskId,
  field,
  value,
  label,
}: {
  taskId: number;
  field: Field;
  value: boolean;
  label: string;
}) {
  const [optimistic, setOptimistic] = useState(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    startTransition(async () => {
      const res = await updateTaskAction(taskId, { [field]: next });
      if (!res.ok) {
        setOptimistic(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={label}
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          optimistic ? "bg-success" : "bg-foreground/15"
        } ${pending ? "opacity-50" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            optimistic ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-sm text-foreground-muted">{label}</span>
      {error ? (
        <span
          className="text-xs text-danger truncate max-w-[12rem]"
          title={error}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
