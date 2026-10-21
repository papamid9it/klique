"use client";

import { useParams } from "next/navigation";
import { CrewView } from "@/components/domain/crews/CrewView";

/** A crew going to an event together. */
export default function CrewPage() {
  const { id } = useParams<{ id: string }>();
  return <CrewView id={id} />;
}
