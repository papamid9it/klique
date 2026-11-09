/**
 * Custom emoji in message text: stored as `<:name:id>` (Discord-style), so an emoji keeps working anywhere it's
 * allowed and falls back to `:name:` once it's deleted. Typing `:name:` in a community turns into that community's
 * emoji when it has one by that name.
 */
export const EMOJI_TOKEN = /<:([a-z0-9_]{2,32}):([a-f0-9]{24})>/g;
export const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
/** emoji ids in a text */
export const emojiIdsIn = (text: string) => [...new Set([...text.matchAll(EMOJI_TOKEN)].map((m) => m[2]))];

/** the most emoji a message can have and still show them big, like Discord */
export const JUMBO_MAX = 27;
const PICTO = /\p{Extended_Pictographic}/gu;
// what joins and tweaks emoji (zero-width joiner, variation selector, skin tones, keycaps, flags' letters)
const GLUE = /[‍️⃣\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}]/gu;
/**
 * Whether a message is only emoji (custom and/or normal ones, with spaces) and at most JUMBO_MAX of them: then they
 * show big. Plain text, even a number, never counts.
 */
export function isEmojiOnly(text: string) {
  const custom = [...text.matchAll(EMOJI_TOKEN)].length;
  const rest = text.replace(EMOJI_TOKEN, "");
  const normal = (rest.match(PICTO) ?? []).length;
  if (!custom && !normal) return false;
  if (custom + normal > JUMBO_MAX) return false;
  return !rest.replace(PICTO, "").replace(GLUE, "").trim();
}
