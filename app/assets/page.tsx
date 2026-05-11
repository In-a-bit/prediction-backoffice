import { Suspense } from "react";

import { AddAssetSection } from "./add-asset-section";
import { AssetsTable } from "./assets-table";
import { Skeleton } from "@/components/skeleton";
import {
  Card,
  ErrorMessage,
  PageHeader,
} from "@/components/ui";
import { listAssets } from "@/lib/api";
import type { Asset } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  let assets: Asset[] = [];
  let error: string | null = null;
  try {
    assets = await listAssets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const existingBases = new Set(assets.map((a) => a.base.toLowerCase()));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Tradeable base/quote pairs available to tasks. Adding an asset queries the resolution source (Binance) for supported USDT-quoted pairs."
      />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <Card>
        <div className="overflow-x-auto">
          <AssetsTable assets={assets} />
        </div>
      </Card>

      <Suspense fallback={<Skeleton className="h-48" />}>
        <AddAssetSection existingBases={Array.from(existingBases)} />
      </Suspense>
    </div>
  );
}
