"use client";

import { moveMessage } from "@/lib/moveGroup";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { emitAppEvent } from "@/lib/appEvents";
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
  // made: the "bring your group over" step (a message to paste into the old WhatsApp group), then the community
  const [made, setMade] = useState<{ slug: string; name: string } | null>(null);

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
      {made && <BringYourGroup made={made} onDone={() => router.push(`/communities/${made.slug}`)} />}
      <CommunityWizard
        onCancel={leave}
        onSubmit={async (input) => {
          const res = await CommunityService.create(input);
          // the rail, Your communities and the Communities page show it at once
          emitAppEvent("membership");
          toast("Community created", "success");
          setMade({ slug: res.data.slug, name: res.data.name });
        }}
      />
    </div>
  );
}

/** Right after making it: a ready message (and link) to paste into the old WhatsApp group, so everyone comes over. */
function BringYourGroup({ made, onDone }: { made: { slug: string; name: string }; onDone: () => void }) {
  const toast = useToast();
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/communities/${made.slug}`;
  const message = moveMessage(made.name, url);
  return (
    <Modal open onClose={onDone} title="Bring your group over" description="Paste this into your WhatsApp or Facebook group (or anywhere your people are). It has the link to join." size="md">
      <div className="space-y-4">
        <p className="rounded-control border border-line bg-raised p-3 text-sm whitespace-pre-line">{message}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-control bg-ink px-4 text-sm font-semibold text-canvas hover:opacity-90">
            Share on WhatsApp
          </a>
          {/* Facebook takes only the link (it fills in the preview); the message is copied for pasting with it */}
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => void navigator.clipboard.writeText(message).then(() => toast("Message copied: paste it into your Facebook post", "success"), () => {})} className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm font-semibold hover:bg-raised">
            Share on Facebook
          </a>
          <Button onClick={() => void navigator.clipboard.writeText(message).then(() => toast("Copied", "success"), () => toast("Couldn't copy it", "error"))}>Copy message</Button>
          <Button variant="ghost" onClick={onDone}>Go to {made.name}</Button>
        </div>
      </div>
    </Modal>
  );
}
