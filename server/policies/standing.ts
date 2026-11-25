import type { ICommunity } from "../models/Community";

/**
 * A community's standing (set by a site admin, Admin → Communities): restricted or suspended, until a date or until
 * lifted. One whose `until` has passed is back to normal on its own (nothing has to run to end it).
 */
export type Standing = NonNullable<ICommunity["standing"]>;

export function standingOf(c: Pick<ICommunity, "standing"> | null | undefined): Standing | null {
  const s = c?.standing;
  if (!s?.state) return null;
  if (s.until && +new Date(s.until) <= Date.now()) return null;
  return s;
}

export const isSuspended = (c: Pick<ICommunity, "standing"> | null | undefined) => standingOf(c)?.state === "suspended";

/** For lists people browse (Discover, search, the landing page): leaves out restricted and suspended communities. */
export function listedFilter(): Record<string, unknown> {
  return { $nor: [{ "standing.state": { $in: ["restricted", "suspended"] }, $or: [{ "standing.until": null }, { "standing.until": { $gt: new Date() } }] }] };
}
