"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { CommunityWizard } from "@/components/domain/space/CommunityWizard";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";

export default function NewCommunityPage() {
  const router = useRouter();
  const toast = useToast();
  const { status, requireAuth } = useAuth();

  useEffect(() => {
    if (status === "anon") requireAuth({ redirect: true });
  }, [status, requireAuth]);

  if (status !== "authed") {
    return <p role="status" className="py-16 text-center text-sm text-ink-muted">{status === "loading" ? "Loading…" : "Redirecting you to sign in…"}</p>;
  }

  return (
    <div className="py-4 sm:py-10">
      <CommunityWizard
        onSubmit={async (input) => {
          const res = await CommunityService.create(input);
          toast("Community created", "success");
          router.push(`/communities/${res.data.slug}`);
        }}
      />
    </div>
  );
}
