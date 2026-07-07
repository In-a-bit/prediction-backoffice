import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { auth, roles as rolesApi } from "@/lib/api";
import { can } from "@/lib/auth";

import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const me = await auth.me().catch(() => null);
  if (!me) redirect("/login");
  if (!can(me.permissions, "users.read")) {
    return (
      <div className="text-sm text-foreground-muted">
        You don&apos;t have permission to view roles.
      </div>
    );
  }

  const [roleRows, catalog] = await Promise.all([
    rolesApi.list(),
    rolesApi.permissions(),
  ]);
  const canManage = can(me.permissions, "roles.manage");

  return (
    <>
      <PageHeader
        title="Roles"
        description="Preset (system) roles are fixed. Compose custom roles from the permission catalog."
      />
      <RolesClient roles={roleRows} catalog={catalog} canManage={canManage} />
    </>
  );
}
