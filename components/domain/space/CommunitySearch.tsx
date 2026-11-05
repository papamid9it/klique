"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import ApiClient from "@/app/ApiCore";
import { ChannelService } from "@/app/services/ChannelService";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { relativeStamp } from "@/lib/format";
import { useApi, useDebounced, useNow } from "@/lib/hooks/useApi";
import { softNavigate } from "@/lib/nav";
import type { CommunitySearchDTO, Envelope, SearchHitDTO, SearchKind, UserBrief } from "@/lib/types";

const api = new ApiClient();

const FILTERS: { key: string; hint: string }[] = [
  { key: "from:", hint: "@someone" },
  { key: "in:", hint: "#channel" },
  { key: "mentions:", hint: "@someone" },
  { key: "has:", hint: "image, video, link, sticker" },
  { key: "before:", hint: "2026-10-01" },
  { key: "after:", hint: "2026-10-01" },
  { key: "during:", hint: "2026-10 or a day" },
  { key: "pinned:", hint: "true" },
  { key: "type:", hint: "message, topic, post, event, klique, member" },
];
const HAS = ["image", "video", "link", "sticker"];
const TYPES = ["message", "topic", "post", "event", "klique", "member"];

/**
 * The search box in a community's header (Discord style): free text plus filters. While typing, it suggests the
 * filters themselves, then what fits each one (people for from:/mentions:, channels for in:, kinds for has:/type:).
 * Enter opens the results view (?view=search&q=…).
 */
export function CommunitySearchBox({ slug, channels, initial }: { slug: string; channels: { slug: string; name: string }[]; initial: string }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<UserBrief[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => setQ(initial), [initial]);
  const last = q.split(/\s+/).pop() ?? "";
  const m = last.match(/^(from|mentions|in|has|type|pinned):(.*)$/i);
  const who = useDebounced(m && (m[1] === "from" || m[1] === "mentions") ? m[2].replace(/^@/, "") : null, 150);
  useEffect(() => {
    if (who === null) return setPeople([]);
    let live = true;
    ChannelService.searchMembers({ slug, sub: null }, who).then((r) => live && setPeople(r.data.slice(0, 6)), () => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [who, slug]);

  const options: { label: string; insert: string; hint?: string; avatar?: UserBrief }[] = !m
    ? FILTERS.filter((f) => !last || f.key.startsWith(last.toLowerCase())).map((f) => ({ label: f.key, insert: f.key, hint: f.hint }))
    : m[1] === "from" || m[1] === "mentions"
      ? people.map((u) => ({ label: `@${u.handle}`, insert: `${m[1]}:@${u.handle} `, hint: u.displayName, avatar: u }))
      : m[1] === "in"
        ? channels.filter((c) => c.slug.startsWith(m[2].replace(/^#/, "").toLowerCase())).slice(0, 8).map((c) => ({ label: `#${c.name}`, insert: `in:#${c.slug} ` }))
        : m[1] === "has"
          ? HAS.filter((h) => h.startsWith(m[2])).map((h) => ({ label: h, insert: `has:${h} ` }))
          : m[1] === "type"
            ? TYPES.filter((t) => t.startsWith(m[2])).map((t) => ({ label: t, insert: `type:${t} ` }))
            : [{ label: "true", insert: "pinned:true " }];
  const show = open && options.length > 0;

  function choose(insert: string) {
    const parts = q.split(/(\s+)/);
    parts[parts.length - 1] = insert;
    setQ(parts.join(""));
    setActive(0);
    requestAnimationFrame(() => box.current?.focus());
  }
  const go = () => {
    setOpen(false);
    softNavigate(`/communities/${slug}?view=search&q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="relative w-full max-w-[16rem]">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (show && options[active] && last && !last.endsWith(" ") && !q.endsWith(" ")) return choose(options[active].insert);
          go();
        }}
      >
        <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted" />
        <input
          ref={box}
          value={q}
          onChange={(e) => (setQ(e.target.value), setActive(0), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
            } else if (e.key === "Tab") {
              e.preventDefault();
              choose(options[active].insert);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search"
          aria-label="Search this community"
          className="h-8 w-full rounded-control border border-line bg-raised pr-2 pl-8 text-[13px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none"
        />
      </form>
      {show && (
        <ul role="listbox" className="absolute right-0 z-30 mt-1 w-72 rounded-card border border-line bg-surface p-1.5 shadow-lg">
          {!m && <li className="px-2.5 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-muted uppercase">Search options</li>}
          {options.map((o, i) => (
            <li
              key={o.insert}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => (e.preventDefault(), choose(o.insert))}
              onMouseEnter={() => setActive(i)}
              className={cx("flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px]", i === active && "bg-raised")}
            >
              {o.avatar && <Avatar name={o.avatar.displayName} src={o.avatar.avatarUrl} size={20} />}
              <span className="font-semibold">{o.label}</span>
              {o.hint && <span className="ml-auto truncate text-[12px] text-ink-muted">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS: { id: SearchKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "message", label: "Messages" },
  { id: "topic", label: "Board" },
  { id: "post", label: "Posts" },
  { id: "event", label: "Events" },
  { id: "klique", label: "Kliques" },
  { id: "member", label: "Members" },
];
const GROUP_TITLE: Record<SearchKind, string> = { message: "Messages", topic: "Board posts", post: "Posts", event: "Events", klique: "Kliques", member: "Members" };

/** The search words, bolded where they appear. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const rx = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(rx);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-accent/20 px-0.5 text-ink">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Hit({ h, words, now }: { h: SearchHitDTO; words: string[]; now: Date | null }) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-surface p-3">
      {h.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" src={h.image} alt="" className="size-11 shrink-0 rounded-[10px] object-cover" />
      ) : (
        <Avatar name={h.author?.displayName ?? "?"} src={h.author?.avatarUrl} size={36} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
          <span className="font-semibold">{h.kind === "member" ? h.title : (h.author?.displayName ?? "Someone")}</span>
          {h.kind !== "member" && <span className="text-ink-muted">{h.title}</span>}
          {h.pinned && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-muted">
              <Icon name="pushpin" size={11} /> Pinned
            </span>
          )}
          {h.at && now && <span className="font-mono text-[11px] text-ink-muted">{relativeStamp(h.at, now)}</span>}
        </p>
        <p className="mt-0.5 line-clamp-3 text-[14px] break-words text-ink/90">
          <Highlight text={h.snippet} words={words} />
        </p>
      </div>
      <Link href={h.href} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-semibold hover:bg-raised">
        {h.kind === "message" ? "Jump" : "Open"}
      </Link>
    </li>
  );
}

/**
 * Results for a community search: tabs per kind with counts (All shows a few of each), Relevance / Newest,
 * matches highlighted, "Jump" to a chat message (its channel opens at that message, flashing), "Show more".
 */
export function CommunitySearchResults({ slug, q }: { slug: string; q: string }) {
  const now = useNow();
  const [tab, setTab] = useState<SearchKind | "all">("all");
  const [sort, setSort] = useState<"relevance" | "newest" | null>(null);
  const [page, setPage] = useState(1);
  const [extra, setExtra] = useState<SearchHitDTO[]>([]);
  useEffect(() => {
    setTab("all");
    setPage(1);
    setExtra([]);
  }, [q]);
  const params = { q, ...(tab !== "all" ? { type: tab } : {}), ...(sort ? { sort } : {}) };
  const key = `community-search:${slug}:${JSON.stringify(params)}`;
  const res = useApi(() => api.get<Envelope<CommunitySearchDTO>>(`/api/communities/${slug}/search`, params), [key], { key });
  const d = res.data;
  const words = (d?.query ?? "").split(/\s+/).filter((w) => w.length > 1);

  async function more() {
    const next = page + 1;
    const r = (await api.get<Envelope<CommunitySearchDTO>>(`/api/communities/${slug}/search`, { ...params, page: String(next) })).data;
    setExtra((x) => [...x, ...r.hits]);
    setPage(next);
    res.setData((cur) => (cur ? { ...cur, hasMore: r.hasMore } : cur));
  }

  let body: ReactNode;
  if (!q.trim()) body = <EmptyState icon="search" title="Search this community">Messages, board posts, posts, events, kliques and members. Try from:@someone, in:#general, has:image or during:2026-10.</EmptyState>;
  else if (res.loading && !d) body = <RowSkeleton rows={4} />;
  else if (res.error || !d) body = <ErrorState message={res.error} onRetry={res.reload} />;
  else {
    const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
    const hits = [...d.hits, ...extra];
    body = !total ? (
      <EmptyState icon="search" title="Nothing found">
        Try fewer words, or other filters.
      </EmptyState>
    ) : tab === "all" ? (
      <div className="space-y-6">
        {(Object.keys(GROUP_TITLE) as SearchKind[])
          .filter((k) => d.counts[k] > 0)
          .map((k) => (
            <section key={k} aria-label={GROUP_TITLE[k]}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {GROUP_TITLE[k]} <span className="text-ink-muted">· {d.counts[k]}</span>
                </h3>
                {d.counts[k] > hits.filter((h) => h.kind === k).length && (
                  <button type="button" onClick={() => (setTab(k), setPage(1), setExtra([]))} className="text-[13px] font-semibold text-accent-text hover:underline">
                    See all
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {hits
                  .filter((h) => h.kind === k)
                  .map((h) => (
                    <Hit key={`${h.kind}:${h.id}`} h={h} words={words} now={now} />
                  ))}
              </ul>
            </section>
          ))}
      </div>
    ) : (
      <>
        <ul className="space-y-2">
          {hits.map((h) => (
            <Hit key={`${h.kind}:${h.id}`} h={h} words={words} now={now} />
          ))}
        </ul>
        {d.hasMore && (
          <div className="mt-4 flex justify-center">
            <Button size="sm" onClick={() => void more()}>
              Show more
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {d && d.filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.filters.map((f) => (
            <span key={f} className="rounded-full bg-raised px-2.5 py-0.5 font-mono text-[12px]">
              {f}
            </span>
          ))}
        </div>
      )}
      {q.trim() && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="no-bar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="What to show">
            {TABS.map((t) => {
              const n = t.id === "all" ? null : d?.counts[t.id];
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => (setTab(t.id), setPage(1), setExtra([]))} className={cx("shrink-0 rounded-full border px-3 py-1 text-[13px] transition", tab === t.id ? "border-accent-text bg-surface font-semibold" : "border-line text-ink-muted hover:text-ink")}>
                  {t.label}
                  {n ? ` · ${n}` : ""}
                </button>
              );
            })}
          </div>
          <select value={sort ?? d?.sort ?? "relevance"} onChange={(e) => (setSort(e.target.value as "relevance" | "newest"), setPage(1), setExtra([]))} aria-label="Sort" className="h-8 rounded-control border border-line bg-raised px-2 text-[13px]">
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      )}
      {body}
    </div>
  );
}
