import {
  Card,
  CardBody,
  ErrorMessage,
  PageHeader,
  Tabs,
  type Tab,
} from "@/components/ui";
import { loadMarketRows } from "@/lib/market-rows";
import type { PlanSource } from "@/lib/source-from-plan";

import { MarketsTable } from "./_table";

export const dynamic = "force-dynamic";

type Source = "all" | PlanSource;

function isSource(v: unknown): v is Source {
  return v === "all" || v === "manual" || v === "crypto" || v === "sport";
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const source: Source = isSource(sp.source) ? sp.source : "all";

  const payload = await loadMarketRows({ source });

  const tabs: Tab<Source>[] = [
    { key: "all", label: "All", href: "/markets" },
    { key: "manual", label: "Manual", href: "/markets?source=manual" },
    { key: "crypto", label: "Crypto", href: "/markets?source=crypto" },
    { key: "sport", label: "Sport", href: "/markets?source=sport" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Markets"
        description="Every market the backoffice has produced. Filter by source, status, acceptance, or UMA resolution; click any row to drill into the unified market detail."
      />

      <Tabs current={source} tabs={tabs} label="Market source" />

      {payload.error ? (
        <ErrorMessage>Source unreachable: {payload.error}</ErrorMessage>
      ) : null}

      <Card>
        <CardBody>
          <MarketsTable data={payload} />
        </CardBody>
      </Card>
    </div>
  );
}
