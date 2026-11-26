import { EventPageSkeleton } from "@/components/ui/Skeleton";

/** While an event's page is prepared: the event's own layout, the same one it shows while loading data. */
export default function Loading() {
  return <EventPageSkeleton />;
}
