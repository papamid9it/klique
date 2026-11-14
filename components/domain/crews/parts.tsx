"use client";

import { DEFAULT_ZONE, isoToWall, wallToIso } from "@/lib/timezones";
import { SoftLink } from "@/components/ui/SoftLink";
import { Avatar } from "@/components/ui/Avatar";
import { cdn } from "@/lib/cdn";
import { splitFocal } from "@/lib/focal";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { formatDateShort, formatTime } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import { getInterest } from "@/lib/constants";
import type { CrewCardDTO, CrewStanding, EventDTO, MyCrewDTO, UserBrief } from "@/lib/types";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";
import { PlanBadge } from "@/components/domain/account/PlanTab";
import { audienceTag } from "./AudienceFields";

/**
 * Where an event's kliques live: the "Kliques" view of its community (or group), opened on that event.
 * Events outside any community have a kliques page of their own (/events/<id>/kliques).
 */
export function crewsHref(e: Pick<EventDTO, "id" | "community" | "subcommunity">): string {
  if (!e.community) return `/events/${e.id}/kliques`;
  const q = new URLSearchParams();
  if (e.subcommunity) q.set("g", e.subcommunity.slug);
  q.set("view", "kliques");
  q.set("e", e.id);
  return `/communities/${e.community.slug}?${q}`;
}

/** One klique, opened inside its community (left panel stays put), or on its own page when it has none. */
export function crewHref(c: Pick<CrewCardDTO, "id" | "space">): string {
  if (!c.space) return `/kliques/${c.id}`;
  return `/communities/${c.space.slug}?${c.space.sub ? `g=${c.space.sub}&` : ""}klique=${c.id}`;
}

/** Wall-clock parts in a zone (Lagos when none) for date/time inputs, and back. */
export const wallInputs = (iso: string, zone?: string | null) => isoToWall(iso, zone || DEFAULT_ZONE);
export const fromWall = (date: string, time: string, zone?: string | null) => wallToIso(date, time, zone || DEFAULT_ZONE) ?? new Date(`${date}T${time}:00+01:00`).toISOString();

/**
 * Overlapping faces, like "who's in" on a group chat: at most 3 equal circles (the photo, or one capital initial
 * centred), each with a ring in the card's colour, overlapping by about a third, then a "+N" pill.
 */
export function Faces({ people, total, size = 22 }: { people: UserBrief[]; total: number; size?: number }) {
  const shown = people.slice(0, 3);
  const extra = total - shown.length;
  const overlap = Math.round(size / 3);
  return (
    <span className="inline-flex shrink-0 items-center">
      {shown.map((p, i) => {
        const initial = (p.displayName.trim()[0] ?? "?").toUpperCase();
        return (
          <span
            key={p.id}
            title={p.displayName}
            style={{ width: size, height: size, marginLeft: i ? -overlap : 0, zIndex: 3 - i, fontSize: Math.max(9, Math.round(size * 0.45)) }}
            className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised font-semibold text-ink ring-2 ring-surface"
          >
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" src={cdn(splitFocal(p.avatarUrl).src, { w: size * 2, h: size * 2, fit: "face" })} alt="" className="size-full object-cover" />
            ) : (
              <span aria-hidden="true" className="leading-none">
                {initial}
              </span>
            )}
          </span>
        );
      })}
      {extra > 0 && <span className="ml-1 rounded-full bg-raised px-1.5 py-px font-mono text-[10.5px] font-semibold text-ink-muted">+{extra}</span>}
    </span>
  );
}

/** "Ada, Tobi and 6 others are going" (host first). */
export function goingLine(c: Pick<CrewCardDTO, "faces" | "memberCount">): string {
  const names = c.faces.slice(0, 2).map((f) => f.displayName.split(" ")[0]);
  const others = c.memberCount - names.length;
  if (!names.length) return "Be the first to join";
  if (others <= 0) return `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} going`;
  return `${names.join(", ")} and ${others} ${others === 1 ? "other" : "others"} are going`;
}

const STANDING: Record<Exclude<CrewStanding, null>, string> = { host: "Your klique", member: "You're in", pending: "Asked to join" };

export function StandingTag({ standing }: { standing: CrewStanding }) {
  if (!standing) return null;
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", standing === "pending" ? "border border-line text-ink-muted" : "bg-accent text-accent-ink")}>{STANDING[standing]}</span>;
}

/** What the card's button says for this viewer. */
function actionLabel(crew: CrewCardDTO, joinable: boolean): string {
  const s = crew.viewer.standing;
  return s === "host" ? "Yours" : s === "member" ? "You're in" : s === "pending" ? "Asked" : crew.closed ? "Closed" : crew.isFull ? "Full" : !joinable ? "View" : crew.joinMode === "open" ? "Join" : "Ask to join";
}

/**
 * A klique as a card: a big cover picture with the date on it, the hook line, the host, the faces of who's going
 * ("Ada, Tobi and 6 others are going"), spots left and a button in. `wide`: a full-width card (in the feed);
 * otherwise a fixed-width tile for rows you swipe.
 */
export function KliqueCard({ crew, wide, joinable = true, onDismiss }: { crew: CrewCardDTO; wide?: boolean; joinable?: boolean; onDismiss?: () => void }) {
  const href = crewHref(crew);
  const spotsLeft = Math.max(0, crew.maxMembers - crew.memberCount);
  const s = crew.viewer.standing;
  const interest = getInterest(crew.interest);
  const where = crew.event ? crew.event.title : crew.community ? crew.community.name : "All communities";
  return (
    <article className={cx("relative flex h-full flex-col overflow-hidden rounded-card border bg-surface", s ? "border-accent-text" : "border-line", wide ? "w-full" : "w-64 shrink-0 snap-start")}>
      <SoftLink href={href} className="block" aria-label={crew.title}>
        <Cover src={crew.coverImage} seed={crew.id} interest={crew.interest} className={wide ? "aspect-[16/8.5]" : "aspect-[4/3]"}>
          <span className="absolute top-2 left-2 rounded-control bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-white uppercase backdrop-blur">
            {formatDateShort(crew.meetupAt, crew.timeZone)}
          </span>
          <span className="absolute top-2 right-2 flex gap-1">
            {audienceTag(crew) && <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">{audienceTag(crew)}</span>}
            <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">{interest.short}</span>
          </span>
        </Cover>
      </SoftLink>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <Avatar name={crew.host.displayName} src={crew.host.avatarUrl} size={22} />
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">
              <span className="font-medium text-ink">{crew.host.displayName}</span> · {where}
            </span>
            {crew.host.badge && <PlanBadge plan={crew.host.badge} size={13} />}
            {!crew.event && <VerifiedCheck on={crew.community?.verified} size={12} />}
          </span>
        </div>
        <h3 className={cx("line-clamp-2 leading-snug font-semibold tracking-[-0.01em] break-words", wide ? "text-[16px]" : "text-[15px]")} title={crew.title}>
          <SoftLink href={href} className="hover:underline">
            {crew.title}
          </SoftLink>
        </h3>
        <p className="flex min-w-0 items-center gap-1 text-xs text-ink-muted">
          <Icon name="pin" size={12} className="shrink-0" /> <span className="min-w-0 truncate">{crew.area}</span>
        </p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Faces people={crew.faces} total={crew.memberCount} size={22} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] text-ink-muted">{goingLine(crew)}</span>
            {!crew.closed && <span className={cx("block text-[11px] font-semibold", crew.isFull ? "text-ink-muted" : "text-accent-text")}>{crew.isFull ? `${crew.memberCount}/${crew.maxMembers} · Full` : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}</span>}
          </span>
          <SoftLink href={href} className={buttonClass(s === "host" || s === "member" ? "primary" : !s && !crew.closed && !crew.isFull && joinable ? "primary" : "secondary", "sm", "shrink-0")}>
            {actionLabel(crew, joinable)}
          </SoftLink>
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="self-start text-[11.5px] text-ink-muted hover:text-ink hover:underline">
            Not interested
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * A klique as its photo: the picture fills the card, with who's hosting, the plan, who's going and the way in on a dark
 * fade at the bottom. The Kliques page's grid.
 */
export function KliquePhotoCard({ crew, joinable = true, className = "aspect-[4/5]", unread = 0, onDismiss }: { crew: CrewCardDTO; joinable?: boolean; /** its size; a 4:5 photo by default */ className?: string; /** unread chat messages, on your own kliques */ unread?: number; /** "Not interested", under the card */ onDismiss?: () => void }) {
  const href = crewHref(crew);
  const s = crew.viewer.standing;
  const left = Math.max(0, crew.maxMembers - crew.memberCount);
  const where = crew.event ? crew.event.title : crew.community ? crew.community.name : "All communities";
  const chip = "rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur";
  const card = (
    <article className={cx("relative overflow-hidden rounded-[20px] bg-raised", className, s && "ring-2 ring-accent-text")}>
      <Cover src={crew.coverImage} seed={crew.id} interest={crew.interest} className="absolute inset-0" />
      {/* the whole picture opens it; the button below stays its own */}
      <SoftLink href={href} aria-label={crew.title} className="absolute inset-0" />
      <span className="pointer-events-none absolute top-2.5 left-2.5 flex gap-1.5">
        <span className={chip}>{formatDateShort(crew.meetupAt, crew.timeZone)}</span>
      </span>
      <span className="pointer-events-none absolute top-2.5 right-2.5 flex gap-1.5">
        {audienceTag(crew) && <span className={chip}>{audienceTag(crew)}</span>}
        {unread > 0 ? <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-black">{unread > 99 ? "99+" : unread} new</span> : <span className={chip}>{getInterest(crew.interest).short}</span>}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3.5 pt-14 pb-3.5 text-white">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-white/85">
          <Avatar name={crew.host.displayName} src={crew.host.avatarUrl} size={20} />
          <span className="truncate">
            <span className="font-semibold text-white">{crew.host.displayName}</span> · {where}
          </span>
        </p>
        <h3 className="mt-1.5 line-clamp-2 text-[17px] leading-snug font-bold break-words">{crew.title}</h3>
        <p className="mt-0.5 truncate text-xs text-white/85">
          {crew.area}
          {!crew.closed && ` · ${crew.isFull ? "Full" : `${left} ${left === 1 ? "spot" : "spots"} left`}`}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <Faces people={crew.faces} total={crew.memberCount} size={22} />
          <span className="min-w-0 flex-1 truncate text-xs text-white/90">{goingLine(crew)}</span>
          <SoftLink href={href} className="pointer-events-auto inline-flex h-8 shrink-0 items-center rounded-full bg-white px-3.5 text-xs font-bold text-black hover:bg-white/90">
            {actionLabel(crew, joinable)}
          </SoftLink>
        </div>
      </div>
    </article>
  );
  if (!onDismiss) return card;
  return (
    <div>
      {card}
      <button type="button" onClick={onDismiss} className="mt-1.5 text-[11.5px] text-ink-muted hover:text-ink hover:underline">
        Not interested
      </button>
    </div>
  );
}

/**
 * One klique in a list, laid out like an event row: meetup time · faces · the hook line and who's hosting ·
 * head count · a button into the klique.
 */
export function CrewRow({ crew, joinable = true }: { crew: CrewCardDTO; joinable?: boolean }) {
  const href = crewHref(crew);
  const [clock, meridiem] = formatTime(crew.meetupAt, crew.timeZone).split(" ");
  const spotsLeft = crew.maxMembers - crew.memberCount;
  const s = crew.viewer.standing;
  return (
    <article className={cx("flex items-center gap-3.5 rounded-card border bg-surface p-3 transition hover:border-ink-muted/50 sm:gap-4 sm:p-3.5", s ? "border-accent-text" : "border-line")}>
      <div className="w-12 shrink-0 text-center leading-none sm:w-14" aria-hidden="true">
        <p className="eyebrow text-[10px]">Meet</p>
        <p className="mt-1 text-xl font-semibold tracking-tight">{clock}</p>
        <p className="mt-1 font-mono text-[10px] text-ink-muted">{meridiem}</p>
      </div>
      <span className="hidden shrink-0 sm:block">
        <Faces people={crew.faces} total={crew.memberCount} size={30} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow truncate">
          {crew.joinMode === "open" ? "Open" : "Ask to join"}
          {audienceTag(crew) ? ` · ${audienceTag(crew)!.toLowerCase()}` : ""} · hosted by {crew.host.displayName}
        </p>
        <h3 className="mt-0.5 truncate text-[16px] font-semibold tracking-[-0.02em]">
          <SoftLink href={href} scroll={false} className="hover:underline">
            {crew.title}
          </SoftLink>
        </h3>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
          From {crew.area} · {goingLine(crew)}
        </p>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 md:flex">
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted">
          <Icon name="users" size={12} /> {crew.memberCount}/{crew.maxMembers}
        </span>
        {!crew.closed && (crew.isFull ? <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold text-ink-muted">Full</span> : <span className="text-[11px] text-ink-muted">{spotsLeft} left</span>)}
      </div>
      <SoftLink href={href} scroll={false} className={buttonClass(s === "host" || s === "member" ? "primary" : "secondary", "sm", "shrink-0")}>
        {actionLabel(crew, joinable)}
      </SoftLink>
    </article>
  );
}

/**
 * What leaving a community (group = null) or one of its groups does to your kliques there, in a sentence for the
 * "Leave?" dialog. Empty when you have none.
 */
export function crewLeaveWarning(crews: MyCrewDTO[], group: string | null): string {
  const mine = crews.filter((x) => (group ? x.sub === group : true));
  if (!mine.length) return "";
  const hosting = mine.filter((x) => x.standing === "host").length;
  const names = mine.map((x) => `“${x.title}”`).join(", ");
  return ` You'll also leave ${mine.length === 1 ? "your klique" : `your ${mine.length} kliques`} ${names}.${hosting ? ` ${hosting === 1 ? "The klique you host" : "Kliques you host"} will be called off, and everyone in ${hosting === 1 ? "it" : "them"} is told.` : ""}`;
}
