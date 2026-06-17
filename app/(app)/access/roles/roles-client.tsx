"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Badge, buttonVariants, Field, inputClass } from "@/components/ui";
import type {
  Permission,
  PermissionCatalogDomain,
  RoleRow,
} from "@/lib/auth";

import { createRole, deleteRole, updateRole } from "../actions";

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-surface border border-border rounded-xl shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-foreground-muted hover:text-foreground cursor-pointer" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function PermissionGrid({
  catalog,
  selected,
  onToggle,
  disabled,
}: {
  catalog: PermissionCatalogDomain[];
  selected: Set<Permission>;
  onToggle: (p: Permission) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {catalog.map((d) => (
        <fieldset key={d.domain} className="border border-border rounded-md p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            {d.label}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {d.permissions.map((p) => (
              <label key={p.key} className="flex items-start gap-2 text-sm cursor-pointer" title={p.description}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(p.key)}
                  disabled={disabled}
                  onChange={() => onToggle(p.key)}
                />
                <span>
                  <span className="font-medium">{p.label}</span>
                  <span className="block text-[11px] text-foreground-muted font-mono">{p.key}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function RolesClient({
  roles,
  catalog,
  canManage,
}: {
  roles: RoleRow[];
  catalog: PermissionCatalogDomain[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(role: RoleRow) {
    if (!confirm(`Delete the custom role "${role.name}"?`)) return;
    const res = await deleteRole(role.id);
    if (!res.ok) {
      setError(res.error ?? "Failed to delete role");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          className={buttonVariants.primary}
          disabled={!canManage}
          title={canManage ? undefined : "Requires the \"roles.manage\" permission"}
          onClick={() => setCreating(true)}
        >
          New role
        </button>
      </div>

      <div className="grid gap-3">
        {roles.map((r) => (
          <div key={r.id} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  {r.is_system ? <Badge tone="neutral">system</Badge> : <Badge tone="info">custom</Badge>}
                </div>
                {r.description ? (
                  <p className="text-sm text-foreground-muted mt-0.5">{r.description}</p>
                ) : null}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  className={buttonVariants.secondary}
                  disabled={!canManage || r.is_system}
                  title={r.is_system ? "System roles are fixed" : canManage ? undefined : "Requires the \"roles.manage\" permission"}
                  onClick={() => setEditing(r)}
                >
                  Edit
                </button>
                <button
                  className={buttonVariants.danger}
                  disabled={!canManage || r.is_system}
                  title={r.is_system ? "System roles cannot be deleted" : undefined}
                  onClick={() => onDelete(r)}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {r.permissions.length === 0 ? (
                <span className="text-xs text-foreground-muted">no permissions</span>
              ) : (
                r.permissions.map((p) => (
                  <span key={p} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-foreground/5 border border-border">
                    {p}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <RoleModal
          title="New role"
          catalog={catalog}
          onClose={() => setCreating(false)}
          onSubmit={async ({ name, description, permissions }) =>
            createRole({ name, description, permissions })
          }
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
          onError={setError}
        />
      ) : null}

      {editing ? (
        <RoleModal
          title={`Edit ${editing.name}`}
          catalog={catalog}
          initial={editing}
          nameLocked
          onClose={() => setEditing(null)}
          onSubmit={async ({ description, permissions }) =>
            updateRole(editing.id, { description, permissions })
          }
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function RoleModal({
  title,
  catalog,
  initial,
  nameLocked,
  onClose,
  onSubmit,
  onDone,
  onError,
}: {
  title: string;
  catalog: PermissionCatalogDomain[];
  initial?: RoleRow;
  nameLocked?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    permissions: Permission[];
  }) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set(initial?.permissions ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setLocalError(null);
    onError(null);
    const res = await onSubmit({
      name: name.trim(),
      description: description.trim(),
      permissions: [...selected],
    });
    setBusy(false);
    if (!res.ok) {
      setLocalError(res.error ?? "Failed to save role");
      return;
    }
    onDone();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="role-name" required>
          <input
            id="role-name"
            className={inputClass}
            value={name}
            disabled={nameLocked}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. treasury-reviewer"
          />
        </Field>
        <Field label="Description" htmlFor="role-desc">
          <input id="role-desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Permissions">
          <PermissionGrid
            catalog={catalog}
            selected={selected}
            onToggle={(p) =>
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(p)) n.delete(p);
                else n.add(p);
                return n;
              })
            }
          />
        </Field>
        {localError ? (
          <div className="text-sm text-danger" role="alert">
            {localError}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button className={buttonVariants.ghost} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={buttonVariants.primary} onClick={submit} disabled={busy || !name}>
            {busy ? "Saving…" : "Save role"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
