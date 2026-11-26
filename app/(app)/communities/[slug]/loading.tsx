import { CommunitySkeleton } from "@/components/ui/Skeleton";

/** While a community's page is prepared: its own layout (channels and a chat), the same one it shows while loading data. */
export default function Loading() {
  return <CommunitySkeleton />;
}
