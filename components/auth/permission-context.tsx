"use client";

import {
  createContext,
  useContext,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { can as canFn, type Me, type Permission } from "@/lib/auth";

const MeContext = createContext<Me | null>(null);

/** Provides the current user + permissions to the client tree. */
export function PermissionProvider({
  me,
  children,
}: {
  me: Me;
  children: ReactNode;
}) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** The current authenticated user. Throws if used outside the provider. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) {
    throw new Error("useMe must be used within a PermissionProvider");
  }
  return me;
}

/** Whether the current user holds a given permission. */
export function useCan(perm: Permission): boolean {
  return canFn(useMe().permissions, perm);
}

/** Renders children only when the user holds `permission`, else `fallback`. */
export function Gate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useCan(permission) ? children : fallback}</>;
}

/**
 * A button that, when the user lacks `permission`, renders disabled with a
 * tooltip explaining why. The server still enforces — this is UX + defense in
 * depth, not the gate.
 */
export function PermissionButton({
  permission,
  className = "",
  children,
  disabled,
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { permission: Permission }) {
  const allowed = useCan(permission);
  const blocked = disabled || !allowed;
  return (
    <button
      {...props}
      disabled={blocked}
      aria-disabled={blocked}
      title={!allowed ? `Requires the "${permission}" permission` : title}
      className={`${className} ${!allowed ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}
