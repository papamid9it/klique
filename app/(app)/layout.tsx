import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppOpenBar } from "@/components/domain/AppOpenBar";
import { AppShell } from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      {children}
      {/* an Android phone's browser: "Open in the Klique app" (the app, or the Play Store to get it) */}
      <Suspense fallback={null}>
        <AppOpenBar />
      </Suspense>
    </AppShell>
  );
}
