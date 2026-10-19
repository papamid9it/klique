import { Suspense } from "react";
import { EventsExplorer } from "@/components/domain/events/EventsExplorer";
import { RowSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-52 w-full rounded-card" />
          <RowSkeleton />
        </div>
      }
    >
      <EventsExplorer />
    </Suspense>
  );
}
