import type { Metadata } from "next";
import { Suspense } from "react";
import { ReelsView } from "@/components/domain/feed/ReelsView";

export const metadata: Metadata = { title: "Reels" };

export default function ReelsPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
      <ReelsView />
    </Suspense>
  );
}
