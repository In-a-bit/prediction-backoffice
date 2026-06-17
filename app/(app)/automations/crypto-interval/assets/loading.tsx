import { Skeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-1/2" />
      <TableSkeleton rows={4} />
      <Skeleton className="h-48" />
    </div>
  );
}
