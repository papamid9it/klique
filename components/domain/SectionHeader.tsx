import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeader({ title, href, action, hrefLabel = "View all" }: { title: string; href?: string; action?: ReactNode; hrefLabel?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
      {href ? (
        <Link href={href} className="eyebrow shrink-0 hover:text-ink">
          {hrefLabel} ↗
        </Link>
      ) : (
        action
      )}
    </div>
  );
}
