"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Shown beside the list on desktop when no conversation is open (on phones the list itself is the page). */
export default function MessagesHome() {
  const { status } = useAuth();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-5 inline-flex size-16 items-center justify-center rounded-full bg-raised text-accent-text">
          <Icon name="message" size={28} />
        </span>
        <h1 className="display text-3xl">Messages</h1>
        <p className="mt-3 text-sm text-ink-muted">{status === "authed" ? "Pick a conversation on the left, or see who's already in your friends list." : "Chat one-to-one with people from your communities."}</p>
        {status === "authed" && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button href="/messages/friends" variant="primary">
              <Icon name="users" size={15} /> Friends
            </Button>
            <Button href="/messages/friends?tab=add">
              <Icon name="userplus" size={15} /> Add friend
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
