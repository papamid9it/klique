import "server-only";
import { CATEGORY_SLUG, DEFAULT_CATEGORIES, setCategories, type Category } from "@/lib/constants";
import { badRequest } from "../http/errors";
import { AppSetting } from "../models/AppSetting";
import { Community } from "../models/Community";
import { Event } from "../models/Event";
import { User } from "../models/User";

/**
 * The category list (Admin → Categories). Stored as one setting; until an admin saves one, it's the built-in
 * defaults. Every API request loads it into the shared registry first (cached briefly), so validators and
 * helpers in lib/constants see the admin's list. Categories are never deleted, only hidden: whatever already
 * uses a hidden one keeps it.
 */

const KEY = "categories";
const TTL_MS = 30_000;
let loadedAt = 0;
let current: Category[] = DEFAULT_CATEGORIES;

const clean = (c: Category): Category => ({
  id: c.id,
  name: c.name.trim().slice(0, 40),
  short: (c.short || c.name).trim().slice(0, 16),
  glyph: (c.glyph || "•").trim().slice(0, 4),
  ...(c.hidden ? { hidden: true } : {}),
});

/** The list, fresh within 30 seconds. Also fills the shared registry. */
export async function getCategories(): Promise<Category[]> {
  if (Date.now() - loadedAt < TTL_MS) return current;
  const row = await AppSetting.findById(KEY).lean<{ value?: unknown }>();
  const stored = Array.isArray(row?.value) ? (row!.value as Category[]) : null;
  current = stored?.length ? stored.map(clean) : DEFAULT_CATEGORIES;
  loadedAt = Date.now();
  setCategories(current);
  return current;
}

/**
 * Save the admin's list: names, symbols, order, hidden. Existing categories can't disappear (hide them
 * instead), new ones need a fresh slug, and at least 3 must stay visible (new people pick 3 when they join).
 */
export async function saveCategories(input: Category[]): Promise<Category[]> {
  const before = await getCategories();
  const seen = new Set<string>();
  const next: Category[] = [];
  for (const raw of input) {
    const id = raw.id.trim().toLowerCase();
    if (!CATEGORY_SLUG.test(id)) throw badRequest(`"${raw.id}" isn't a valid short name: use 2-30 lowercase letters, numbers or dashes.`);
    if (seen.has(id)) throw badRequest(`"${id}" is in the list twice.`);
    if (!raw.name.trim()) throw badRequest("Every category needs a name.");
    seen.add(id);
    next.push(clean({ ...raw, id }));
  }
  const dropped = before.filter((c) => !seen.has(c.id));
  if (dropped.length) throw badRequest(`Categories can't be removed, only hidden: ${dropped.map((c) => c.name).join(", ")}.`);
  if (next.filter((c) => !c.hidden).length < 3) throw badRequest("Keep at least 3 categories visible: new people pick 3 when they join.");
  await AppSetting.updateOne({ _id: KEY }, { $set: { value: next } }, { upsert: true });
  current = next;
  loadedAt = Date.now();
  setCategories(next);
  return next;
}

/** How many communities, events and people use each category (for the admin page). */
export async function categoryUsage(): Promise<Record<string, { communities: number; events: number; people: number }>> {
  const [c, e, u] = await Promise.all([
    Community.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$interest", n: { $sum: 1 } } }]),
    Event.aggregate<{ _id: string; n: number }>([{ $match: { cancelled: false, review: null, startsAt: { $gte: new Date() } } }, { $group: { _id: "$interest", n: { $sum: 1 } } }]),
    User.aggregate<{ _id: string; n: number }>([{ $unwind: "$interests" }, { $group: { _id: "$interests", n: { $sum: 1 } } }]),
  ]);
  const out: Record<string, { communities: number; events: number; people: number }> = {};
  const at = (id: string) => (out[id] ??= { communities: 0, events: 0, people: 0 });
  for (const r of c) at(r._id).communities = r.n;
  for (const r of e) at(r._id).events = r.n;
  for (const r of u) at(r._id).people = r.n;
  return out;
}
