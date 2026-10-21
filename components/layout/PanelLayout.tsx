import type { ReactNode } from "react";

/**
 * A page with its own left panel (Ads Manager, Notifications): the panel sits beside the slim icon rail on big
 * screens and stays put while the page scrolls; on phones it's replaced by `mobile` (a compact bar above the page).
 */
export function PanelLayout({ panel, mobile, children }: { panel: ReactNode; mobile?: ReactNode; children: ReactNode }) {
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface/40 lg:block">{panel}</aside>
      <div className="min-w-0">
        {mobile && <div className="border-b border-line px-4 py-3 lg:hidden">{mobile}</div>}
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-32 sm:px-8 lg:px-10 lg:pt-8 lg:pb-16">{children}</div>
      </div>
    </div>
  );
}
