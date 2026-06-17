import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { auth, roles as rolesApi, users as usersApi } from "@/lib/api";
import { can } from "@/lib/auth";

import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await auth.me().catch(() => null);
  if (!me) redirect("/login");
  if (!can(me.permissions, "users.read")) {
    return (
      <div className="text-sm text-foreground-muted">
        You don&apos;t have permission to view users.
      </div>
    );
  }

  const [userRows, roleRows] = await Promise.all([
    usersApi.list(),
    rolesApi.list(),
  ]);
  const canManage = can(me.permissions, "users.manage");

  return (
    <>
      <PageHeader
        title="Users"
        description="Backoffice login accounts and the roles assigned to them."
      />
      <UsersClient users={userRows} roles={roleRows} canManage={canManage} />
    </>
  );
}
