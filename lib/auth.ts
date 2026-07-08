// Auth + RBAC types shared across the backoffice UI. The Permission union
// mirrors the Go catalog in apps/backoffice/internal/authz/permissions.go —
// keep them in sync.

export type Permission =
  | "markets.read"
  | "markets.create"
  | "markets.lifecycle"
  | "oracle.read"
  | "oracle.propose"
  | "oracle.dispute"
  | "oracle.resolve"
  | "plans.read"
  | "plans.write"
  | "plans.terminate"
  | "tasks.read"
  | "tasks.write"
  | "configs.read"
  | "configs.write"
  | "alerts.read"
  | "alerts.ack"
  | "wallets.read"
  | "wallets.admin"
  | "treasury.withdraw"
  | "liquidity_providers.read"
  | "liquidity_providers.manage"
  | "users.read"
  | "users.manage"
  | "roles.manage"
  | "audit.read";

/** The current authenticated user, as returned by GET /auth/me. */
export type Me = {
  id: number;
  email: string;
  is_root: boolean;
  roles: string[];
  // Effective permission set (root receives the full catalog).
  permissions: Permission[];
};

/** A backoffice user row (GET /auth/users). */
export type UserRow = {
  id: number;
  email: string;
  is_active: boolean;
  is_root: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  roles: { id: number; name: string }[];
  permissions: Permission[];
};

/** A role row (GET /auth/roles). */
export type RoleRow = {
  id: number;
  name: string;
  description: string;
  is_system: boolean;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
};

/** One permission in the catalog (GET /auth/permissions). */
export type PermissionCatalogEntry = {
  key: Permission;
  label: string;
  description: string;
};

/** A catalog domain group. */
export type PermissionCatalogDomain = {
  domain: string;
  label: string;
  permissions: PermissionCatalogEntry[];
};

/** An audit-log row (GET /audit). */
export type AuditRow = {
  id: number;
  created_at: string;
  actor_user_id?: number;
  actor_email: string;
  actor_kind: "user" | "root" | "service";
  action: string;
  resource_type?: string;
  resource_id?: string;
  method?: string;
  path?: string;
  ip?: string;
  params?: Record<string, unknown>;
  result_status?: number;
  error?: string;
};

/** Returns true when the given permission set includes perm. */
export function can(
  perms: readonly Permission[] | null | undefined,
  perm: Permission,
): boolean {
  return !!perms && perms.includes(perm);
}
