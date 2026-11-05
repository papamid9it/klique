import { Skeleton } from "@/components/ui/Skeleton";

/** Shows at once while a page loads, so nothing ever looks frozen. The menus around it stay in place. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-1/3 rounded-control" />
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
    </div>
  );
}
