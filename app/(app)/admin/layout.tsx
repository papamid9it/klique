import type { ReactNode } from "react";
import { AdminShell } from "@/components/domain/admin/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
