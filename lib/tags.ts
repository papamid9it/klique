/**
 * Tags in posts and comments (not chat, where # means a channel, Discord style):
 *  - @handle tags a person; @community-slug tags a community (slugs may have dashes)
 *  - #tag is a hashtag: a link to /tags/<tag>, listing public posts with it
 * Shared by the server (to store and resolve them) and the client (to render and autocomplete).
 */
export const TAG_SOURCE = "(?<![\\w#&/])#([a-zA-Z][a-zA-Z0-9_]{1,29})(?![\\w])";
export const REF_SOURCE = "(?<![\\w@])@([a-zA-Z0-9][a-zA-Z0-9_-]{1,39})(?![\\w-])";

/** Hashtags in a text, lower-cased, at most `max`. */
export function extractTags(text: string, max = 10): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(new RegExp(TAG_SOURCE, "g"))) {
    out.add(m[1].toLowerCase());
    if (out.size >= max) break;
  }
  return [...out];
}

/** @tokens in a text (people's handles or communities' slugs), lower-cased, at most `max`. */
export function extractRefs(text: string, max = 10): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(new RegExp(REF_SOURCE, "g"))) {
    out.add(m[1].toLowerCase().replace(/-+$/, ""));
    if (out.size >= max) break;
  }
  return [...out];
}

export const normalizeTag = (t: string) => t.replace(/^#/, "").trim().toLowerCase();
export const isTag = (t: string) => /^[a-z][a-z0-9_]{1,29}$/.test(t);

/** The "@que" or "#que" being typed right before the caret, if any. */
export function activeToken(text: string, caret: number): { start: number; kind: "@" | "#"; query: string } | null {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?<![\w@#])([@#])([a-zA-Z0-9_-]{0,40})$/);
  return m ? { start: caret - m[0].length, kind: m[1] as "@" | "#", query: m[2] } : null;
}
