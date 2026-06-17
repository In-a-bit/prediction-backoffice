import { redirect } from "next/navigation";

import { PageHeader, inputClass, buttonVariants, Badge } from "@/components/ui";
import { audit, auth } from "@/lib/api";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SP = {
  action?: string;
  resource_type?: string;
  actor_email?: string;
  offset?: string;
};

const PAGE = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const me = await auth.me().catch(() => null);
  if (!me) redirect("/login");
  if (!can(me.permissions, "audit.read")) {
    return (
      <div className="text-sm text-foreground-muted">
        You don&apos;t have permission to view the audit log.
      </div>
    );
  }

  const sp = await searchParams;
  const offset = sp.offset ? Math.max(0, Number(sp.offset) || 0) : 0;
  const { data, total } = await audit.list({
    action: sp.action,
    resource_type: sp.resource_type,
    actor_email: sp.actor_email,
    limit: PAGE,
    offset,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every privileged action, attributed to the user who performed it."
      />

      <form method="GET" className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Actor email
          <input name="actor_email" defaultValue={sp.actor_email ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Action
          <input name="action" defaultValue={sp.action ?? ""} className={inputClass} placeholder="e.g. POST /auth/users" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Resource type
          <input name="resource_type" defaultValue={sp.resource_type ?? ""} className={inputClass} />
        </label>
        <button type="submit" className={buttonVariants.secondary}>
          Filter
        </button>
      </form>

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.03] text-foreground-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">When</th>
              <th className="text-left px-4 py-2.5 font-medium">Actor</th>
              <th className="text-left px-4 py-2.5 font-medium">Action</th>
              <th className="text-left px-4 py-2.5 font-medium">Resource</th>
              <th className="text-left px-4 py-2.5 font-medium">Result</th>
              <th className="text-left px-4 py-2.5 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">
                  No audit entries match.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5 text-foreground-muted tabular-nums whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{row.actor_email || "—"}</span>
                    <Badge tone={row.actor_kind === "service" ? "warning" : row.actor_kind === "root" ? "accent" : "neutral"}>
                      {row.actor_kind}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{row.action}</td>
                  <td className="px-4 py-2.5 text-foreground-muted">
                    {row.resource_type ? `${row.resource_type}${row.resource_id ? ` #${row.resource_id}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {row.result_status ? (
                      <Badge tone={row.result_status < 400 ? "success" : "danger"}>{row.result_status}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-muted font-mono text-xs">{row.ip || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-foreground-muted">
        <span className="tabular-nums">
          {total} total · showing {offset + 1}–{Math.min(offset + PAGE, total)}
        </span>
        <div className="flex gap-2">
          {offset > 0 ? (
            <a className={buttonVariants.secondary} href={buildHref(sp, Math.max(0, offset - PAGE))}>
              Previous
            </a>
          ) : null}
          {offset + PAGE < total ? (
            <a className={buttonVariants.secondary} href={buildHref(sp, offset + PAGE)}>
              Next
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}

function buildHref(sp: SP, offset: number): string {
  const q = new URLSearchParams();
  if (sp.actor_email) q.set("actor_email", sp.actor_email);
  if (sp.action) q.set("action", sp.action);
  if (sp.resource_type) q.set("resource_type", sp.resource_type);
  q.set("offset", String(offset));
  return `/access/audit?${q.toString()}`;
}
