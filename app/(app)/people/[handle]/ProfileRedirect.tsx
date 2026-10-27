"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { profileHref } from "@/components/providers/ProfileCardProvider";

export function ProfileRedirect() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(profileHref(decodeURIComponent(handle)));
  }, [handle, router]);
  return null;
}
