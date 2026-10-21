"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Promoting an event is now a regular ad request (reviewed, then paid): send old links to the new form. */
export default function PromotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/ads/new?event=${id}`);
  }, [id, router]);
  return null;
}
