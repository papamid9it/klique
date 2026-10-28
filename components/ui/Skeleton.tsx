import { cx } from "./cx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton", className)} />;
}

export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface" aria-hidden="true">
      <Skeleton className="h-32 rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-5 min-[540px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* Page-shaped placeholders: each mirrors the real layout it stands in for, so nothing jumps when it arrives. */

/** a line of text: varied widths read as text instead of a stack of bars */
const Line = ({ className }: { className?: string }) => <Skeleton className={cx("h-3 rounded-[5px]", className)} />;
const widths = ["w-3/5", "w-2/5", "w-4/5", "w-1/2", "w-2/3", "w-1/3"];

/** A chat: a header (who or which channel), messages (picture, name, a line or two) and the message box. */
export function ChatSkeleton({ header = true, rows = 6 }: { header?: boolean; rows?: number }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" role="status" aria-label="Loading chat">
      {header && (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="space-y-1.5">
            <Line className="w-32" />
            <Line className="h-2.5 w-20 opacity-70" />
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-5 overflow-hidden px-4 py-5 sm:px-6">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <Line className="w-28" />
              <Line className={widths[i % widths.length]} />
              {i % 3 === 1 && <Line className={widths[(i + 2) % widths.length]} />}
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-line px-4 py-3 sm:px-6">
        <Skeleton className="h-12 w-full rounded-card" />
      </div>
    </div>
  );
}

/** A community's channel list: its name, the sections, then a category or two of channels. */
export function ChannelListSkeleton() {
  return (
    <div className="space-y-5 p-3" aria-hidden="true">
      <Line className="mx-1 mt-2 h-4 w-36" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-1.5">
            <Skeleton className="size-4 shrink-0 rounded-[5px]" />
            <Line className={widths[i]} />
          </div>
        ))}
      </div>
      {[3, 2].map((n, g) => (
        <div key={g} className="space-y-2.5">
          <Line className="mx-1.5 h-2.5 w-16 opacity-70" />
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-1.5">
              <span className="font-mono text-sm text-ink-muted/40">#</span>
              <Line className={widths[(i + g + 1) % widths.length]} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A conversation list: avatar, name and last message per row. */
export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1 p-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-control px-2 py-2">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Line className="w-24" />
            <Line className={cx("h-2.5 opacity-70", widths[(i + 1) % widths.length])} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** An event page: the cover, then the details beside the going-or-not card. */
export function EventPageSkeleton() {
  return (
    <div role="status" aria-label="Loading event">
      <Skeleton className="aspect-[16/8] w-full rounded-card" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Skeleton className="h-6 w-28 rounded-full" />
          <div className="space-y-2.5">
            <Skeleton className="h-8 w-4/5 rounded-[8px]" />
            <Skeleton className="h-8 w-1/2 rounded-[8px]" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-5 shrink-0 rounded-[6px]" />
              <div className="flex-1 space-y-1.5">
                <Line className={widths[i]} />
                <Line className={cx("h-2.5 opacity-70", widths[i + 2])} />
              </div>
            </div>
          ))}
          <div className="space-y-2.5 pt-3">
            <Line className="h-4 w-20" />
            <Line className="w-full" />
            <Line className="w-11/12" />
            <Line className="w-3/5" />
          </div>
        </div>
        <div className="space-y-3 self-start rounded-card border border-line bg-surface p-4">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-9 w-full rounded-full opacity-70" />
          <div className="flex items-center gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="size-7 rounded-full" />
            ))}
            <Line className="w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The full profile: the person's side (banner, picture, name, about) and their tabs and list. */
export function ProfileSkeleton() {
  return (
    <div className="flex h-full flex-col md:min-h-[34rem] md:flex-row" role="status" aria-label="Loading profile">
      <div className="shrink-0 border-b border-line md:w-[22rem] md:border-r md:border-b-0">
        <Skeleton className="h-32 rounded-none" />
        <div className="px-5 pb-5">
          <span className="relative -mt-14 inline-block rounded-full bg-surface p-1.5">
            <Skeleton className="size-[104px] rounded-full" />
          </span>
          <div className="mt-2 space-y-2">
            <Skeleton className="h-6 w-44 rounded-[8px]" />
            <Line className="w-24 opacity-70" />
          </div>
          <Skeleton className="mt-4 h-9 w-full rounded-full" />
          <div className="mt-5 space-y-2.5 rounded-card border border-line p-4">
            <Line className="h-2.5 w-16 opacity-70" />
            <Line className="w-full" />
            <Line className="w-3/4" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 p-5">
        <div className="flex gap-5 border-b border-line pb-3">
          {["w-14", "w-24", "w-16"].map((w) => (
            <Line key={w} className={w} />
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-card border border-line p-3">
              <Skeleton className="size-11 shrink-0 rounded-[10px]" />
              <div className="flex-1 space-y-1.5">
                <Line className={widths[i]} />
                <Line className={cx("h-2.5 opacity-70", widths[i + 1])} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
