"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * An explicit post's pictures, video or text card (only in communities that allow explicit content): blurred
 * behind "Explicit · tap to view" until the viewer taps, every time it shows, even for people who opted in.
 */
export function ExplicitCover({ explicit, children }: { explicit: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  if (!explicit || shown) return <>{children}</>;
  return (
    <div className="relative overflow-hidden rounded-control">
      <div aria-hidden="true" className="pointer-events-none blur-2xl select-none [&_*]:pointer-events-none">
        {children}
      </div>
      <button type="button" onClick={() => setShown(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-white/15">
          <Icon name="eye" size={20} />
        </span>
        <span className="text-[14px] font-semibold">Explicit · tap to view</span>
      </button>
    </div>
  );
}
