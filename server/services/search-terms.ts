import { escapeRegex } from "./helpers";

/**
 * What someone typed, the way a search engine reads it: every word has to match somewhere, so "skate lagos" finds what
 * has both, in any order. "exact words" in quotes stay together, and -word leaves out anything with that word.
 */
export function parseSearch(q: string): { include: string[]; exclude: string[] } {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const m of q.matchAll(/(-?)"([^"]+)"|(\S+)/g)) {
    if (m[2]) (m[1] ? exclude : include).push(m[2].trim());
    else if (m[3].length > 1 && m[3].startsWith("-")) exclude.push(m[3].slice(1));
    else if (m[3] !== "-") include.push(m[3].replace(/^@/, ""));
  }
  return { include: include.filter(Boolean), exclude: exclude.filter(Boolean) };
}

/** A database filter for what they typed, across these fields. */
export function searchFilter(q: string, fields: string[]): Record<string, unknown> {
  const { include, exclude } = parseSearch(q);
  const any = (word: string) => {
    const rx = new RegExp(escapeRegex(word), "i");
    return fields.map((f) => ({ [f]: rx }));
  };
  const and = [...include.map((w) => ({ $or: any(w) })), ...exclude.map((w) => ({ $nor: any(w) }))];
  return and.length ? { $and: and } : {};
}

/** How well a name matches: the whole thing, the start of it, or anywhere. Best first, when results are ranked. */
export function matchScore(name: string, q: string): number {
  const n = name.toLowerCase();
  const words = parseSearch(q).include.map((w) => w.toLowerCase());
  const phrase = words.join(" ");
  if (!phrase) return 0;
  if (n === phrase) return 4;
  if (n.startsWith(phrase)) return 3;
  if (n.includes(phrase)) return 2;
  return words.every((w) => n.includes(w)) ? 1 : 0;
}
