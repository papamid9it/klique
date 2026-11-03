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

/**
 * Mass mentions, Discord style: @everyone (everyone who can see the channel) and @here (only those online now).
 * Klique also takes @all (= @everyone) and @channel (= @here). They only ping when the author may use them
 * (owners and admins always; members when the community allows it); otherwise they're plain words.
 */
export const MASS_WORDS: Record<string, "everyone" | "here"> = { everyone: "everyone", all: "everyone", here: "here", channel: "here" };
const MASS_SOURCE = "(?<![\\w@])@(everyone|all|here|channel)(?![\\w])";

/** The widest mass mention in a message: "everyone" beats "here"; null when there's none. */
export function extractMassMention(body: string): "everyone" | "here" | null {
  let found: "everyone" | "here" | null = null;
  for (const m of body.matchAll(new RegExp(MASS_SOURCE, "gi"))) {
    const kind = MASS_WORDS[m[1].toLowerCase()];
    if (kind === "everyone") return "everyone";
    found = kind;
  }
  return found;
}

/** Handles nobody can have: they're the mass mentions. */
export const RESERVED_HANDLES = new Set(Object.keys(MASS_WORDS));
