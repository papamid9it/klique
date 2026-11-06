import type { Metadata } from "next";
import { Suspense } from "react";
import { EventsExplorer } from "@/components/domain/events/EventsExplorer";
import { RowSkeleton, Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Events", description: "Real-life events near you and around the world. Find something on and go with people on klique." };

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
