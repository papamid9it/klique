import type { ReactNode } from "react";
import { MessagesShell } from "@/components/domain/messages/MessagesShell";

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <MessagesShell>{children}</MessagesShell>;
}
