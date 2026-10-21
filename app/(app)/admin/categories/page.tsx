"use client";

import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { CategoriesAdmin } from "@/components/domain/admin/CategoriesAdmin";

/** Admin → Categories. */
export default function AdminCategoriesPage() {
  return (
    <AdminGate>
      <AdminHeader title="Categories">
        What communities, events and people can be into. New people pick at least 3 when they join, then join communities in those categories. Hide one to stop offering it; nothing that uses it changes.
      </AdminHeader>
      <CategoriesAdmin />
    </AdminGate>
  );
}
