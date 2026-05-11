import { CardSkeleton, Skeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-24" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSkeleton />
        <div className="lg:col-span-2 space-y-2">
          <TableSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}
