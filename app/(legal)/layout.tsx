import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-6 sm:px-8">
        <Logo tagline />
        <nav aria-label="Legal" className="flex gap-4 text-sm text-ink-muted">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-8">
        {children}
      </main>
    </div>
  );
}
