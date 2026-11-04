import type { Connection } from "mongoose";
import { DEFAULT_CATEGORIES, textGlyph, type Category } from "@/lib/constants";

/**
 * One-off (Nov 2026): broad categories, so almost any community has a home (Music, Faith, Sports, Tech…). Adds the
 * ones that are missing to the category list (Admin → Categories), after the existing ones. A category counts as
 * already there when its slug or name matches (any case), or when an existing one clearly covers it (Film covers
 * Movies & TV, Art covers Art & Design…). Nothing existing is renamed, hidden, removed or reordered.
 * Runs once per database ("migration:categories-broad-v1").
 */
export const BROAD_CATEGORIES: (Category & { coveredBy?: string[] })[] = [
  { id: "music", name: "Music", short: "Music", glyph: "♫" },
  { id: "faith", name: "Faith & Religion", short: "Faith", glyph: "✧" },
  { id: "movies-tv", name: "Movies & TV", short: "Movies", glyph: "▶", coveredBy: ["film", "movies", "movie", "tv"] },
  { id: "romance", name: "Dating & Romance", short: "Dating", glyph: "♡", coveredBy: ["dating", "love", "relationships"] },
  { id: "sports", name: "Sports", short: "Sports", glyph: "⚽", coveredBy: ["sport", "football"] },
  { id: "tech", name: "Tech", short: "Tech", glyph: "⌘", coveredBy: ["technology"] },
  { id: "gaming", name: "Gaming", short: "Gaming", glyph: "◈", coveredBy: ["games"] },
  { id: "fashion-beauty", name: "Fashion & Beauty", short: "Fashion", glyph: "✂", coveredBy: ["fashion", "beauty"] },
  { id: "food", name: "Food & Drinks", short: "Food", glyph: "☕", coveredBy: ["food-drink", "food-drinks"] },
  { id: "nightlife", name: "Nightlife & Parties", short: "Nightlife", glyph: "☾", coveredBy: ["parties", "party"] },
  { id: "art-design", name: "Art & Design", short: "Art", glyph: "✎", coveredBy: ["art", "design"] },
  { id: "books", name: "Books & Writing", short: "Books", glyph: "✒", coveredBy: ["writing", "reading"] },
  { id: "comedy", name: "Comedy", short: "Comedy", glyph: "☺", coveredBy: ["memes"] },
  { id: "business", name: "Business & Money", short: "Business", glyph: "◆", coveredBy: ["money", "finance"] },
  { id: "careers", name: "Careers & Education", short: "Careers", glyph: "✐", coveredBy: ["education", "learning"] },
  { id: "fitness", name: "Health & Fitness", short: "Fitness", glyph: "✚", coveredBy: ["health", "wellness"] },
  { id: "travel", name: "Travel & Adventure", short: "Travel", glyph: "✈", coveredBy: ["adventure", "outdoors"] },
  { id: "anime", name: "Anime & Comics", short: "Anime", glyph: "✪", coveredBy: ["comics", "manga"] },
  { id: "photo-film", name: "Photography & Film", short: "Photo", glyph: "◉", coveredBy: ["photography", "photo"] },
  { id: "dance", name: "Dance", short: "Dance", glyph: "❋" },
  { id: "cars", name: "Cars & Bikes", short: "Cars", glyph: "⚙", coveredBy: ["bikes", "motors"] },
  { id: "news", name: "News & Politics", short: "News", glyph: "◎", coveredBy: ["politics"] },
  { id: "family", name: "Family & Parenting", short: "Family", glyph: "⌂", coveredBy: ["parenting"] },
  { id: "pets", name: "Pets & Animals", short: "Pets", glyph: "✿", coveredBy: ["animals"] },
  { id: "causes", name: "Causes & Volunteering", short: "Causes", glyph: "♥", coveredBy: ["volunteering", "charity"] },
  { id: "campus", name: "Campus Life", short: "Campus", glyph: "◇", coveredBy: ["university", "school", "students"] },
  { id: "culture", name: "Culture & Languages", short: "Culture", glyph: "✺", coveredBy: ["languages", "heritage"] },
];

const norm = (s: string) => s.trim().toLowerCase();

/** The list with the missing broad categories added at the end (exported for the test). */
export function withBroad(existing: Category[]): { list: Category[]; added: string[]; skipped: string[] } {
  const ids = new Set(existing.map((c) => norm(c.id)));
  const names = new Set(existing.map((c) => norm(c.name)));
  const list = [...existing];
  const added: string[] = [];
  const skipped: string[] = [];
  for (const { coveredBy = [], ...c } of BROAD_CATEGORIES) {
    const there = ids.has(c.id) || names.has(norm(c.name)) || coveredBy.some((k) => ids.has(k) || names.has(k));
    if (there) {
      skipped.push(c.name);
      continue;
    }
    list.push({ ...c, glyph: textGlyph(c.glyph) });
    ids.add(c.id);
    names.add(norm(c.name));
    added.push(c.name);
  }
  return { list, added, skipped };
}

export async function migrateCategories(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<{ _id: string; value?: unknown; updatedAt?: Date }>("appsettings");
  try {
    await settings.insertOne({ _id: "migration:categories-broad-v1", value: { state: "running" }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }
  // the admin's saved list, or the built-in one if nobody has saved a list yet
  const row = await settings.findOne({ _id: "categories" });
  const existing = Array.isArray(row?.value) && row.value.length ? (row.value as Category[]) : DEFAULT_CATEGORIES;
  const { list, added, skipped } = withBroad(existing);
  if (added.length) await settings.updateOne({ _id: "categories" }, { $set: { value: list, updatedAt: new Date() } }, { upsert: true });
  await settings.updateOne({ _id: "migration:categories-broad-v1" }, { $set: { value: { state: "done", added, skipped }, updatedAt: new Date() } });
  return "migrated";
}
