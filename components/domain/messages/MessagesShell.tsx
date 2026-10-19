"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { DmSidebar } from "./DmSidebar";

/**
 * Messages workspace: [people you chat with · the conversation (or friends) · info on the right].
 * On phones one pane at a time: the list at /messages, the conversation or friends page otherwise.
 */
export function MessagesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isList = pathname === "/messages" || pathname === "/messages/";
  return (
    <div className="flex h-dvh min-h-0">
      <aside className={cx("min-h-0 w-full shrink-0 flex-col border-r border-line bg-surface/40 pb-20 lg:flex lg:w-72 lg:pb-0", isList ? "flex" : "hidden")}>
        <DmSidebar />
      </aside>
      <div className={cx("min-h-0 min-w-0 flex-1 flex-col lg:flex", isList ? "hidden" : "flex")}>{children}</div>
    </div>
  );
}
