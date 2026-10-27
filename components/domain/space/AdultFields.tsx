"use client";

import Link from "next/link";

/**
 * 18+ and explicit content for a private community (server/policies/adult): 18+ means only people 18 and over (by
 * date of birth) can find, see or join it; explicit content additionally needs members to switch it on in Settings,
 * and takes no money. Shown only for private communities.
 */
export function AdultFields({ adult, explicit, onChange }: { adult: boolean; explicit: boolean; onChange: (v: { adult: boolean; explicit: boolean }) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-[13px] font-medium">Age</legend>
      <label className="flex cursor-pointer gap-3 rounded-control border border-line bg-raised p-3.5 has-[:checked]:border-accent-text has-[:checked]:bg-surface">
        <input type="checkbox" checked={adult} onChange={(e) => onChange({ adult: e.target.checked, explicit: e.target.checked && explicit })} className="mt-1 size-4 accent-[var(--accent-text)]" />
        <span>
          <span className="block text-sm font-semibold">18+ community</span>
          <span className="mt-0.5 block text-xs text-ink-muted">Mature themes like nightlife, alcohol or adult topics. Only people 18 and over can find, see or join it, and it never shows in feeds, search or Discover. No nudity, pornography or sexual services.</span>
        </span>
      </label>
      {adult && (
        <label className="flex cursor-pointer gap-3 rounded-control border border-line bg-raised p-3.5 has-[:checked]:border-accent-text has-[:checked]:bg-surface">
          <input type="checkbox" checked={explicit} onChange={(e) => onChange({ adult, explicit: e.target.checked })} className="mt-1 size-4 accent-[var(--accent-text)]" />
          <span>
            <span className="block text-sm font-semibold">Allows explicit content</span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              Members must also turn on Show explicit content in their Settings. Explicit posts are blurred until tapped. No donations, contributions or payouts. You must moderate it.{" "}
              <Link href="/terms#adult" className="underline">
                Rules
              </Link>
            </span>
          </span>
        </label>
      )}
    </fieldset>
  );
}
