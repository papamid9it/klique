"use client";

import { placeShort } from "@/lib/places";
import { ProfileTrigger, useProfileCard } from "@/components/providers/ProfileCardProvider";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FriendService } from "@/app/services/FriendService";
import { MessageService } from "@/app/services/MessageService";
import { FriendButton } from "@/components/domain/friends/FriendButton";
import { OverflowMenu } from "@/components/domain/OverflowMenu";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";

import { useApi } from "@/lib/hooks/useApi";
import type { FriendStatusDTO, UserBrief } from "@/lib/types";
import { UserName } from "@/components/ui/UserName";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";

type Tab = "all" | "pending" | "add";

/** Friends hub, Discord-style: All · Pending · Add friend, with "people you may know" beside it. */
export default function FriendsPage() {
  const { status, requireAuth } = useAuth();
  const authed = status === "authed";
  const router = useRouter();
  const card = useProfileCard();
  const sp = useSearchParams();
  const toast = useToast();
  const tab: Tab = sp.get("tab") === "pending" ? "pending" : sp.get("tab") === "add" ? "add" : "all";

  const friends = useApi(authed ? () => FriendService.list() : null, [authed], { key: "friends" });
  const requests = useApi(authed ? () => FriendService.requests() : null, [authed], { key: "friend-requests" });
  const suggestions = useApi(authed ? () => FriendService.suggestions() : null, [authed], { key: "friend-suggestions" });
  useRealtimeEvent(
    () => {
      void friends.reload();
      void requests.reload();
    },
    { filter: (e) => e.type === "notify" && e.category === "friends", debounceMs: 400 },
  );
  const [q, setQ] = useState("");
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const incoming = (requests.data ?? []).filter((r) => r.direction === "incoming");
  const outgoing = (requests.data ?? []).filter((r) => r.direction === "outgoing");

  const go = (t: Tab) => router.replace(t === "all" ? "/messages/friends" : `/messages/friends?tab=${t}`, { scroll: false });
  const refresh = () => void Promise.all([friends.reload(), requests.reload(), suggestions.reload()]);

  async function message(u: UserBrief) {
    try {
      const res = await MessageService.start(u.handle);
      router.push(`/messages/${res.data.conversation.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function sendByHandle(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    if (!h) return;
    setAdding(true);
    setAddError(null);
    setAdded(null);
    try {
      const res = await FriendService.add(h);
      setAdded(res.data.state === "friends" ? `You and @${h} are now friends.` : `Friend request sent to @${h}.`);
      setHandle("");
      refresh();
    } catch (err) {
      setAddError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  if (status === "loading") return <div className="p-6"><RowSkeleton rows={5} /></div>;
  if (!authed) {
    return (
      <div className="p-6">
        <EmptyState icon="users" title="Sign in to see your friends" action={<Button variant="primary" onClick={() => requireAuth()}>Sign in</Button>}>
          Add friends, accept requests and message people you know.
        </EmptyState>
      </div>
    );
  }

  const list = (friends.data ?? []).filter((f) => !q.trim() || f.user.displayName.toLowerCase().includes(q.trim().toLowerCase()) || f.user.handle.includes(q.trim().toLowerCase().replace(/^@/, "")));
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "All", count: friends.data?.length },
    { id: "pending", label: "Pending", count: incoming.length || undefined },
    { id: "add", label: "Add friend" },
  ];

  const personRow = (u: UserBrief, actions: React.ReactNode, sub?: string) => (
    <li key={u.id} className="group flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-raised/60">
      <ProfileTrigger handle={u.handle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={u.displayName} src={u.avatarUrl} frame={u.avatarFrame} size={42} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold"><UserName name={u.displayName} effect={u.nameEffect} /></span>
          <span className="block truncate font-mono text-[11px] text-ink-muted">@{u.handle}{sub ? ` · ${sub}` : ""}</span>
        </span>
      </ProfileTrigger>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Friends">
        <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 sm:px-5">
          <Link href="/messages" aria-label="Back to messages" className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-raised lg:hidden">
            <Icon name="arrow-left" size={20} />
          </Link>
          <h1 className="flex items-center gap-2 text-[15px] font-semibold">
            <Icon name="users" size={18} className="text-ink-muted" /> Friends
          </h1>
          <div role="tablist" aria-label="Friends sections" className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => go(t.id)}
                className={cx("inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition", t.id === "add" ? (tab === "add" ? "bg-accent/20 text-accent-text" : "bg-accent text-accent-ink hover:brightness-110") : tab === t.id ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
              >
                {t.label}
                {typeof t.count === "number" && t.count > 0 && <span className={cx("rounded-full px-1.5 font-mono text-[10px]", t.id === "pending" ? "bg-danger text-white" : "bg-line text-ink-muted")}>{t.count}</span>}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {tab === "all" && (
            <>
              <div className="mb-4 flex h-10 items-center gap-2 rounded-control bg-raised px-3 focus-within:ring-1 focus-within:ring-accent-text">
                <Icon name="search" size={15} className="text-ink-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" aria-label="Search friends" className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
              </div>
              {friends.loading ? (
                <RowSkeleton rows={4} />
              ) : friends.error ? (
                <ErrorState message={friends.error} onRetry={() => void friends.reload()} />
              ) : !list.length ? (
                <EmptyState icon="users" title={q ? "No friends match" : "No friends yet"} compact action={!q ? <Button variant="primary" onClick={() => go("add")}>Add friend</Button> : undefined}>
                  {q ? "Try a different name." : "Add someone by their handle, or pick from people you may know."}
                </EmptyState>
              ) : (
                <>
                  <p className="eyebrow mb-2 px-2">All friends — {list.length}</p>
                  <ul>
                    {list.map((f) =>
                      personRow(
                        f.user,
                        <>
                          <button type="button" onClick={() => void message(f.user)} aria-label={`Message ${f.user.displayName}`} title="Message" className="inline-flex size-9 items-center justify-center rounded-full bg-raised text-ink-muted transition hover:text-ink">
                            <Icon name="message" size={16} />
                          </button>
                          <OverflowMenu
                            label={`${f.user.displayName} options`}
                            items={[
                              { label: "View profile", icon: "user", onSelect: () => card.openFull(f.user.handle) },
                              {
                                label: "Remove friend",
                                icon: "x",
                                danger: true,
                                onSelect: async () => {
                                  try {
                                    await FriendService.remove(f.user.handle);
                                    toast("Removed from your friends", "success");
                                    refresh();
                                  } catch (e) {
                                    toast(errorMessage(e), "error");
                                  }
                                },
                              },
                            ]}
                          />
                        </>,
                        placeShort(f.user),
                      ),
                    )}
                  </ul>
                </>
              )}
            </>
          )}

          {tab === "pending" && (
            <>
              {requests.loading ? (
                <RowSkeleton rows={3} />
              ) : requests.error ? (
                <ErrorState message={requests.error} onRetry={() => void requests.reload()} />
              ) : !incoming.length && !outgoing.length ? (
                <EmptyState icon="userplus" title="No pending requests" compact action={<Button variant="primary" onClick={() => go("add")}>Add friend</Button>}>
                  Requests you send and receive show up here.
                </EmptyState>
              ) : (
                <>
                  {!!incoming.length && (
                    <>
                      <p className="eyebrow mb-2 px-2">Received — {incoming.length}</p>
                      <ul className="mb-6">
                        {incoming.map((r) =>
                          personRow(
                            r.user,
                            <FriendButton handle={r.user.handle} size="sm" status={{ state: "incoming", requestId: r.id } as FriendStatusDTO} onChange={() => refresh()} />,
                          ),
                        )}
                      </ul>
                    </>
                  )}
                  {!!outgoing.length && (
                    <>
                      <p className="eyebrow mb-2 px-2">Sent — {outgoing.length}</p>
                      <ul>
                        {outgoing.map((r) => personRow(r.user, <FriendButton handle={r.user.handle} size="sm" status={{ state: "outgoing", requestId: r.id }} onChange={() => refresh()} />))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {tab === "add" && (
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">Add friend</h2>
              <p className="mt-1 text-sm text-ink-muted">You can add friends with their klique handle.</p>
              <form onSubmit={sendByHandle} className="mt-4 flex items-center gap-2 rounded-card border border-line bg-surface p-2 focus-within:border-accent-text">
                <span className="pl-2 font-mono text-ink-muted">@</span>
                <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="You can add friends with their handle" aria-label="Handle" maxLength={21} className="min-w-0 flex-1 bg-transparent py-2 text-[15px] focus:outline-none" />
                <Button type="submit" variant="primary" loading={adding} disabled={!handle.trim()}>
                  Send friend request
                </Button>
              </form>
              {added && <p role="status" className="mt-3 text-sm font-medium text-success">{added}</p>}
              {addError && <p role="alert" className="mt-3 text-sm font-medium text-danger">{addError}</p>}
            </div>
          )}
        </div>
      </section>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line p-5 xl:block" aria-label="People you may know">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">People you may know</h2>
        <p className="mt-1 mb-3 text-[13px] text-ink-muted">From communities you&apos;re in.</p>
        {suggestions.loading ? (
          <RowSkeleton rows={4} />
        ) : !suggestions.data?.length ? (
          <p className="rounded-card border border-dashed border-line p-4 text-sm text-ink-muted">Join a few communities and the people in them will show up here.</p>
        ) : (
          <ul className="space-y-1.5">
            {suggestions.data.map((s) => (
              <li key={s.user.id} className="rounded-card border border-line bg-surface p-3">
                <ProfileTrigger handle={s.user.handle} className="flex items-center gap-3 text-left">
                  <Avatar name={s.user.displayName} src={s.user.avatarUrl} frame={s.user.avatarFrame} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold"><UserName name={s.user.displayName} effect={s.user.nameEffect} /></span>
                    <span className="block truncate text-[11px] text-ink-muted">
                      {s.mutualCommunities} {s.mutualCommunities === 1 ? "community" : "communities"} in common
                    </span>
                  </span>
                </ProfileTrigger>
                <div className="mt-2.5">
                  <FriendButton handle={s.user.handle} size="sm" status={{ state: "none" }} onChange={() => refresh()} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
