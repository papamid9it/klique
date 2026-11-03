"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { CommunityWizard } from "@/components/domain/space/CommunityWizard";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/layout/Logo";

/** Making a community: a full-screen step of its own (no side menus), with a way back top-left and Cancel. */
export default function NewCommunityPage() {
  const router = useRouter();
  const toast = useToast();
  const { status, requireAuth } = useAuth();

  useEffect(() => {
    if (status === "anon") requireAuth({ redirect: true });
  }, [status, requireAuth]);

  // back to wherever they came from (or Communities when they landed here directly)
  const leave = () => (window.history.length > 1 ? router.back() : router.push("/communities"));

  if (status !== "authed") {
    return <p role="status" className="py-16 text-center text-sm text-ink-muted">{status === "loading" ? "Loading…" : "Redirecting you to sign in…"}</p>;
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-4 sm:py-10">
      <div className="mx-auto mb-4 flex max-w-xl items-center sm:fixed sm:top-4 sm:left-4 sm:mb-0">
        <Link
          href="/communities"
          onClick={(e) => {
            e.preventDefault();
            leave();
          }}
          aria-label="Back"
          className="inline-flex items-center gap-2 rounded-[14px] bg-raised py-1.5 pr-3 pl-1.5 text-sm font-medium text-ink-muted transition hover:bg-surface hover:text-ink"
        >
          <LogoMark size={28} />
          <Icon name="arrow-left" size={14} /> Back
        </Link>
      </div>
      <CommunityWizard
        onCancel={leave}
        onSubmit={async (input) => {
          const res = await CommunityService.create(input);
          toast("Community created", "success");
          router.push(`/communities/${res.data.slug}`);
        }}
      />
    </div>
  );
}
