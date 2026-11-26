import { ChatSkeleton } from "@/components/ui/Skeleton";

/** While a conversation is prepared: a chat, the same as it shows while loading messages. */
export default function Loading() {
  return <ChatSkeleton />;
}
