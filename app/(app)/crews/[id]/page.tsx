"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CrewView } from "@/components/domain/crews/CrewView";

function CrewContent() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  return <CrewView id={id} tab={sp.get("tab")} />;
}

/** A crew going to an event together (?tab=requests: the host's join requests). */
export default function CrewPage() {
  return (
    <Suspense fallback={null}>
      <CrewContent />
    </Suspense>
  );
}
