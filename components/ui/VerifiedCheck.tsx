import { Rosette } from "./Rosette";

/** The "Verified" badge by a community's name (site admins give it; Klique HQ always has it): a gold rosette. */
export function VerifiedCheck({ on, size = 14, className }: { on?: boolean | null; size?: number; className?: string }) {
  if (!on) return null;
  return <Rosette tone="gold" size={size} label="Verified community" className={className} />;
}
