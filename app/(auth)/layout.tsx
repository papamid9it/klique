import type { ReactNode } from "react";
import { AuthStage } from "@/components/domain/auth/AuthShell";
import { Logo } from "@/components/layout/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthStage>
      <header className="px-6 pt-6 sm:px-10 sm:pt-8">
        <Logo tagline />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">{children}</main>
    </AuthStage>
  );
}
