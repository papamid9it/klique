import Link from "next/link";
import { postTagColor } from "@/lib/postTags";
import type { PostTagDTO } from "@/lib/types";
import { cx } from "@/components/ui/cx";

/** A community's tag on a post (lib/postTags), like Reddit's flair: a small coloured label. With `href`, a link. */
export function PostTag({ tag, href, className }: { tag: Pick<PostTagDTO, "name" | "color">; href?: string; className?: string }) {
  const c = postTagColor(tag.color);
  const cls = cx("inline-flex h-6 max-w-full items-center rounded-[6px] px-2 text-[12.5px] font-bold", className);
  const style = { background: c.bg, color: c.ink };
  if (!href) return <span className={cls} style={style}><span className="truncate">{tag.name}</span></span>;
  return (
    <Link href={href} scroll={false} className={cx(cls, "hover:opacity-85")} style={style}>
      <span className="truncate">{tag.name}</span>
    </Link>
  );
}
