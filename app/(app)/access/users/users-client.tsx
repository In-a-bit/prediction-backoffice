"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Badge, buttonVariants, Field, inputClass } from "@/components/ui";
import type { RoleRow, UserRow } from "@/lib/auth";

import { createUser, updateUser } from "../actions";

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
        className="w-full max-w-md bg-surface border border-border rounded-xl shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function RoleCheckboxes({
  roles,
  selected,
  onToggle,
}: {
  roles: RoleRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto border border-border rounded-md p-2">
      {roles.map((r) => (
        <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => onToggle(r.id)}
          />
          <span className="font-medium">{r.name}</span>
          {r.is_system ? <Badge tone="neutral">system</Badge> : null}
        </label>
      ))}
    </div>
  );
}

export function UsersClient({
  users,
  roles,
  canManage,
}: {
  users: UserRow[];
  roles: RoleRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          title={canManage ? undefined : "Requires the \"users.manage\" permission"}
          onClick={() => setCreating(true)}
        >
          New user
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.03] text-foreground-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Email</th>
              <th className="text-left px-4 py-2.5 font-medium">Roles</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Last login</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{u.email}</span>{" "}
                  {u.is_root ? <Badge tone="accent">root</Badge> : null}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <span className="text-foreground-muted">—</span>
                    ) : (
                      u.roles.map((r) => (
                        <Badge key={r.id} tone="neutral">
                          {r.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {u.is_active ? (
                    <Badge tone="success">active</Badge>
                  ) : (
                    <Badge tone="danger">deactivated</Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground-muted tabular-nums">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "never"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    className={buttonVariants.secondary}
                    disabled={!canManage || u.is_root}
                    title={
                      u.is_root
                        ? "The root user is protected"
                        : canManage
                          ? undefined
                          : "Requires the \"users.manage\" permission"
                    }
                    onClick={() => setEditing(u)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating ? (
        <CreateUserModal
          roles={roles}
          onClose={() => setCreating(false)}
          onError={setError}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {editing ? (
        <EditUserModal
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onError={setError}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateUserModal({
  roles,
  onClose,
  onDone,
  onError,
}: {
  roles: RoleRow[];
  onClose: () => void;
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setLocalError(null);
    onError(null);
    const res = await createUser({
      email,
      password,
      role_ids: [...selected],
    });
    setBusy(false);
    if (!res.ok) {
      setLocalError(res.error ?? "Failed to create user");
      return;
    }
    onDone();
  }

  return (
    <Modal title="New user" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Email" htmlFor="new-email" required>
          <input id="new-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Initial password" htmlFor="new-pw" hint="At least 12 characters. Share it out-of-band." required>
          <input id="new-pw" type="text" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Roles">
          <RoleCheckboxes
            roles={roles}
            selected={selected}
            onToggle={(id) =>
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
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
          <button className={buttonVariants.primary} onClick={submit} disabled={busy || !email || !password}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  roles,
  onClose,
  onDone,
  onError,
}: {
  user: UserRow;
  roles: RoleRow[];
  onClose: () => void;
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(user.roles.map((r) => r.id)),
  );
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function save(patch: { is_active?: boolean; role_ids?: number[]; new_password?: string }) {
    setBusy(true);
    setLocalError(null);
    onError(null);
    const res = await updateUser(user.id, patch);
    setBusy(false);
    if (!res.ok) {
      setLocalError(res.error ?? "Failed to update user");
      return false;
    }
    return true;
  }

  return (
    <Modal title={`Edit ${user.email}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">
            Status: {user.is_active ? "active" : "deactivated"}
          </span>
          <button
            className={user.is_active ? buttonVariants.danger : buttonVariants.secondary}
            disabled={busy}
            onClick={async () => {
              if (await save({ is_active: !user.is_active })) onDone();
            }}
          >
            {user.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>

        <Field label="Roles">
          <RoleCheckboxes
            roles={roles}
            selected={selected}
            onToggle={(id) =>
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
          />
          <button
            className={`${buttonVariants.secondary} mt-2 self-start`}
            disabled={busy}
            onClick={async () => {
              if (await save({ role_ids: [...selected] })) onDone();
            }}
          >
            Save roles
          </button>
        </Field>

        <Field label="Reset password" htmlFor="reset-pw" hint="At least 12 characters.">
          <div className="flex gap-2">
            <input id="reset-pw" type="text" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <button
              className={buttonVariants.secondary}
              disabled={busy || newPassword.length < 12}
              onClick={async () => {
                if (await save({ new_password: newPassword })) onDone();
              }}
            >
              Reset
            </button>
          </div>
        </Field>

        {localError ? (
          <div className="text-sm text-danger" role="alert">
            {localError}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
