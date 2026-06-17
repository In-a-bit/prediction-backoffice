import { AssetActiveToggle } from "./asset-active-toggle";
import { Badge, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Asset } from "@/lib/types";

export function AssetsTable({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="No assets yet"
        description="Use the Add asset section below to pick a USDT-quoted pair from the resolution source."
      />
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-foreground-muted">
          <th className="px-5 py-3 font-medium">Symbol</th>
          <th className="px-3 py-3 font-medium">Display name</th>
          <th className="px-3 py-3 font-medium">Source pair</th>
          <th className="px-3 py-3 font-medium">Status</th>
          <th className="px-3 py-3 font-medium">Created</th>
          <th className="px-5 py-3 font-medium text-right">Active</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a) => (
          <tr
            key={a.id}
            className="border-t border-border hover:bg-foreground/[0.02]"
          >
            <td className="px-5 py-3 font-medium">
              {a.base.toUpperCase()}/{a.target.toUpperCase()}
            </td>
            <td className="px-3 py-3">{a.display_name}</td>
            <td className="px-3 py-3 text-foreground-muted">
              <code className="text-xs">
                {a.source_base}
                {a.source_target}
              </code>
            </td>
            <td className="px-3 py-3">
              {a.is_active ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="neutral">Inactive</Badge>
              )}
            </td>
            <td className="px-3 py-3 text-foreground-muted">
              {formatDateTime(a.created_at)}
            </td>
            <td className="px-5 py-3 text-right">
              <AssetActiveToggle assetId={a.id} value={a.is_active} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
