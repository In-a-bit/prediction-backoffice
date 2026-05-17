import Link from "next/link";

import { NewTaskForm } from "./new-task-form";
import {
  Card,
  CardBody,
  EmptyState,
  ErrorMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { crypto } from "@/lib/api";
import { behaviors } from "@/lib/behaviors";
import type { Asset, Interval } from "@/lib/types";

export const dynamic = "force-dynamic";

const behavior = behaviors["crypto-interval"];

export default async function NewCryptoIntervalTaskPage() {
  let assets: Asset[] = [];
  let intervals: Interval[] = [];
  let error: string | null = null;

  try {
    [assets, intervals] = await Promise.all([crypto.listAssets(), crypto.listIntervals()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const activeAssets = assets.filter((a) => a.is_active);

  return (
    <div className="space-y-6">
      <div className="text-sm text-foreground-muted">
        <Link href={behavior.href} className="hover:text-foreground">
          ← All crypto tasks
        </Link>
      </div>

      <PageHeader
        title="New crypto-interval task"
        description="Pick an asset and interval. The backoffice will create a series, attach tags, and start the create / resolve loops automatically."
      />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {activeAssets.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No active assets"
            description="Add an asset before creating a task."
            action={
              <Link
                href="/automations/crypto-interval/assets"
                className={buttonVariants.primary}
              >
                Manage assets
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardBody>
            <NewTaskForm assets={activeAssets} intervals={intervals} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
