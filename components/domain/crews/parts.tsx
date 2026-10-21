"use client";

import { SoftLink } from "@/components/ui/SoftLink";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { formatTime } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import type { CrewCardDTO, CrewStanding, EventDTO, UserBrief } from "@/lib/types";

/**
 * Where an event's crews live: the "Crews" view of its community (or group), opened on that event.
 * Events outside any community keep their crews on the event page.
 */
export function crewsHref(e: Pick<EventDTO, "id" | "community" | "subcommunity">): string {
  if (!e.community) return `/events/${e.id}#crews`;
  const q = new URLSearchParams();
  if (e.subcommunity) q.set("g", e.subcommunity.slug);
  q.set("view", "crews");
  q.set("e", e.id);
  return `/communities/${e.community.slug}?${q}`;
}

/** One crew, opened inside its community (left panel stays put), or on its own page when it has none. */
export function crewHref(c: Pick<CrewCardDTO, "id" | "space">): string {
  if (!c.space) return `/crews/${c.id}`;
  return `/communities/${c.space.slug}?${c.space.sub ? `g=${c.space.sub}&` : ""}crew=${c.id}`;
}

/** Lagos (UTC+1) wall-clock parts for date/time inputs, and back. */
export function lagosInputs(iso: string) {
  const d = new Date(new Date(iso).getTime() + 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}
export const fromLagos = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`).toISOString();

/** Overlapping faces, like "who's in" on a group chat. */
export function Faces({ people, total, size = 26 }: { people: UserBrief[]; total: number; size?: number }) {
  const extra = total - people.length;
  return (
    <span className="inline-flex items-center">
      <span className="flex -space-x-2">
        {people.map((p) => (
          <span key={p.id} className="rounded-full ring-2 ring-surface" title={p.displayName}>
            <Avatar name={p.displayName} src={p.avatarUrl} size={size} />
          </span>
        ))}
      </span>
      {extra > 0 && <span className="ml-1.5 font-mono text-[11px] text-ink-muted">+{extra}</span>}
    </span>
  );
}

const STANDING: Record<Exclude<CrewStanding, null>, string> = { host: "Your crew", member: "You're in", pending: "Asked to join" };

export function StandingTag({ standing }: { standing: CrewStanding }) {
  if (!standing) return null;
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", standing === "pending" ? "border border-line text-ink-muted" : "bg-accent text-accent-ink")}>{STANDING[standing]}</span>;
}

/**
 * One crew in a list, laid out like an event row: meetup time · faces · where from and who's hosting ·
 * head count · a button into the crew.
 */
export function CrewRow({ crew, joinable = true }: { crew: CrewCardDTO; joinable?: boolean }) {
  const href = crewHref(crew);
  const [clock, meridiem] = formatTime(crew.meetupAt).split(" ");
  const spotsLeft = crew.maxMembers - crew.memberCount;
  const s = crew.viewer.standing;
  const action = s === "host" ? "Yours" : s === "member" ? "You're in" : s === "pending" ? "Asked" : crew.closed ? "Closed" : crew.isFull ? "Full" : !joinable ? "View" : crew.joinMode === "open" ? "Join" : "Ask";
  return (
    <article className={cx("flex items-center gap-3.5 rounded-card border bg-surface p-3 transition hover:border-ink-muted/50 sm:gap-4 sm:p-3.5", s ? "border-accent-text" : "border-line")}>
      <div className="w-12 shrink-0 text-center leading-none sm:w-14" aria-hidden="true">
        <p className="eyebrow text-[10px]">Meet</p>
        <p className="mt-1 text-xl font-semibold tracking-tight">{clock}</p>
        <p className="mt-1 font-mono text-[10px] text-ink-muted">{meridiem}</p>
      </div>
      <span className="hidden shrink-0 sm:block">
        <Faces people={crew.faces.slice(0, 3)} total={crew.memberCount} size={30} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow truncate">
          {crew.joinMode === "open" ? "Open" : "Ask to join"} · hosted by {crew.host.displayName}
        </p>
        <h3 className="mt-0.5 truncate text-[16px] font-semibold tracking-[-0.02em]">
          <SoftLink href={href} scroll={false} className="hover:underline">
            From {crew.area}
          </SoftLink>
        </h3>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{crew.note || `Meetup on ${new Date(crew.meetupAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" })}`}</p>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 md:flex">
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted">
          <Icon name="users" size={12} /> {crew.memberCount}/{crew.maxMembers}
        </span>
        {!crew.closed && !crew.isFull && <span className="text-[11px] text-ink-muted">{spotsLeft} left</span>}
      </div>
      <SoftLink href={href} scroll={false} className={buttonClass(s === "host" || s === "member" ? "primary" : "secondary", "sm", "shrink-0")}>
        {action}
      </SoftLink>
    </article>
  );
}
