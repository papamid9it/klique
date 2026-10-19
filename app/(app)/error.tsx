"use client";

import { ErrorState } from "@/components/ui/States";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="This page hit a snag" message="Something unexpected happened. Try again, or head back home." onRetry={reset} />;
}
