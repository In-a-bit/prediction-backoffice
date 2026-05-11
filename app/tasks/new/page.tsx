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
import { listAssets, listIntervals } from "@/lib/api";
import type { Asset, Interval } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  let assets: Asset[] = [];
  let intervals: Interval[] = [];
  let error: string | null = null;

  try {
    [assets, intervals] = await Promise.all([listAssets(), listIntervals()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const activeAssets = assets.filter((a) => a.is_active);

  return (
    <div className="space-y-6">
      <div className="text-sm text-foreground-muted">
        <Link href="/tasks" className="hover:text-foreground">
          ← All tasks
        </Link>
      </div>

      <PageHeader
        title="New task"
        description="Pick an asset and interval. The backoffice will create a series, attach tags, and start the create/resolve loops automatically."
      />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {activeAssets.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No active assets"
            description="Add an asset before creating a task."
            action={
              <Link href="/assets" className={buttonVariants.primary}>
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
