import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * The full-screen stage behind every sign-in page: soft colour from the current mood, a faint dot grid,
 * and a card in the middle (like Discord's). Server component, no JS.
 */
export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(60rem 36rem at 12% -8%, color-mix(in oklab, var(--accent) 34%, transparent), transparent 62%)",
            "radial-gradient(52rem 34rem at 96% 108%, color-mix(in oklab, var(--accent2) 30%, transparent), transparent 60%)",
            "radial-gradient(40rem 30rem at 80% 10%, color-mix(in oklab, var(--accent2) 12%, transparent), transparent 70%)",
            "var(--canvas)",
          ].join(","),
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(color-mix(in oklab, var(--ink) 18%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      {children}
    </div>
  );
}

/** The white-ish rounded box. `wide` adds room for the side panel on the sign-in page. */
export function AuthCard({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div
      className={cx(
        "w-full animate-rise rounded-[22px] border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]",
        wide ? "max-w-[860px]" : "max-w-[480px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-[10px] border px-3.5 py-2.5 text-sm font-medium",
        tone === "error" && "border-danger/40 bg-danger/10 text-danger",
        tone === "success" && "border-success/40 bg-success/10 text-success",
        tone === "info" && "border-line bg-raised text-ink",
      )}
    >
      {children}
    </p>
  );
}
