import Link from "next/link";
import { postTagColor } from "@/lib/postTags";
import type { PostTagDTO } from "@/lib/types";
import { cx } from "@/components/ui/cx";

/**
 * A community's tag on a post (lib/postTags: Reddit's flair), shaped like a price tag: a point on the left with a small
 * hole, the name on its solid colour. With `href`, a link (the community's posts with that tag).
 */
export function PostTag({ tag, href, className }: { tag: Pick<PostTagDTO, "name" | "color">; href?: string; className?: string }) {
  const c = postTagColor(tag.color);
  const body = (
    <>
      <svg width="9" height="22" viewBox="0 0 9 22" aria-hidden="true" className="shrink-0">
        <path d="M9 0 L3 0 Q1.6 0 .9 1.2 L0 11 L.9 20.8 Q1.6 22 3 22 L9 22 Z" fill={c.bg} />
      </svg>
      <span className="inline-flex h-[22px] min-w-0 items-center gap-[5px] rounded-r-[5px] pr-2 pl-[3px] text-[12.5px] font-bold" style={{ background: c.bg, color: c.ink }}>
        <span aria-hidden="true" className="size-1 shrink-0 rounded-full opacity-55" style={{ background: c.ink }} />
        <span className="truncate">{tag.name}</span>
      </span>
    </>
  );
  const cls = cx("inline-flex h-[22px] max-w-full items-center", className);
  if (!href) return <span className={cls}>{body}</span>;
  return (
    <Link href={href} scroll={false} className={cx(cls, "hover:opacity-85")} aria-label={`Posts tagged ${tag.name}`}>
      {body}
    </Link>
  );
}

/**
 * Pick one of a community's tags, or none (click again to clear): "Tag · optional, one", then each tag as a tag shape,
 * outlined with a small square of its colour; the one picked turns solid.
 */
export function PostTagPicker({ tags, value, onChange }: { tags: PostTagDTO[]; value: string | null; onChange: (id: string | null) => void }) {
  if (!tags.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-bold text-ink-muted">
        Tag <span className="font-medium">· optional, one</span>
      </p>
      <div role="radiogroup" aria-label="Tag" className="flex flex-wrap gap-2">
        {tags.map((g) => {
          const on = value === g.id;
          const c = postTagColor(g.color);
          return (
            <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : g.id)} className="inline-flex h-[30px] items-center transition hover:opacity-90">
              <svg width="11" height="30" viewBox="0 0 11 30" aria-hidden="true" className="shrink-0">
                {on ? <path d="M11 0 L4 0 Q2 0 1.1 1.6 L0 15 L1.1 28.4 Q2 30 4 30 L11 30 Z" fill={c.bg} /> : <path d="M11 .75 L4 .75 Q2.4 .75 1.8 2 L.8 15 L1.8 28 Q2.4 29.25 4 29.25 L11 29.25" fill="none" stroke="var(--line)" strokeWidth="1.5" />}
              </svg>
              <span className={cx("inline-flex h-[30px] items-center gap-1.5 rounded-r-[6px] pr-[11px] pl-1 text-[13.5px]", on ? "font-bold" : "border-[1.5px] border-l-0 border-line font-semibold text-ink")} style={on ? { background: c.bg, color: c.ink } : undefined}>
                {on ? <span aria-hidden="true" className="size-[5px] rounded-full opacity-55" style={{ background: c.ink }} /> : <span aria-hidden="true" className="size-[7px] rounded-[2px]" style={{ background: c.bg }} />}
                {g.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
