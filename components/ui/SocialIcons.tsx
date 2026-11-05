import { cx } from "@/components/ui/cx";
import { socialOf, type SocialLink } from "@/lib/socials";

/** A site's icon in its own colours. */
export function SocialIcon({ id, size = 36 }: { id: string; size?: number }) {
  const s = socialOf(id);
  if (!s) return null;
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full border border-line" style={{ width: size, height: size, backgroundColor: s.bg, color: s.fg }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor"><path d={s.path} /></svg>
    </span>
  );
}

/** Just the icons, on a profile; the link's address is never shown. Leaving Klique is checked by LeaveProvider. */
export function SocialRow({ socials, className }: { socials?: SocialLink[]; className?: string }) {
  const shown = (socials ?? []).filter((x) => socialOf(x.platform));
  if (!shown.length) return null;
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {shown.map((x) => {
        const s = socialOf(x.platform)!;
        return (
          <a key={x.platform} href={s.link(x.handle)} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name} className="rounded-full transition-transform hover:scale-105">
            <SocialIcon id={x.platform} />
          </a>
        );
      })}
    </div>
  );
}
