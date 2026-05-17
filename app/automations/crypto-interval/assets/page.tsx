import Link from "next/link";
import { Suspense } from "react";

import { AddAssetSection } from "./add-asset-section";
import { AssetsTable } from "./assets-table";
import { Skeleton } from "@/components/skeleton";
import {
  Card,
  ErrorMessage,
  PageHeader,
} from "@/components/ui";
import { crypto } from "@/lib/api";
import { behaviors } from "@/lib/behaviors";
import type { Asset } from "@/lib/types";

export const dynamic = "force-dynamic";

const behavior = behaviors["crypto-interval"];

export default async function AssetsPage() {
  let assets: Asset[] = [];
  let error: string | null = null;
  try {
    assets = await crypto.listAssets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const existingBases = new Set(assets.map((a) => a.base.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="text-sm text-foreground-muted">
        <Link href={behavior.href} className="hover:text-foreground">
          ← Crypto Intervals
        </Link>
      </div>

      <PageHeader
        title="Crypto assets"
        description="Tradeable base/quote pairs available to crypto-interval tasks. Adding an asset queries the resolution source (Binance) for supported USDT-quoted pairs."
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
