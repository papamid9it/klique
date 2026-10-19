/** @handle tagging, shared by the server (to resolve who was tagged) and the client (to render and autocomplete). */
export const MENTION_SOURCE = "(?<![\\w@])@([a-zA-Z0-9_]{3,20})(?![\\w])";

export function extractMentionHandles(body: string, max = 10): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(new RegExp(MENTION_SOURCE, "g"))) {
    out.add(m[1].toLowerCase());
    if (out.size >= max) break;
  }
  return [...out];
}

/** The "@par" being typed right before the caret, if any. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?<![\w@])@([a-zA-Z0-9_]{0,20})$/);
  return m ? { start: caret - m[0].length, query: m[1] } : null;
}
