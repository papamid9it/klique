/**
 * Custom emoji in message text: stored as `<:name:id>` (Discord-style), so an emoji keeps working anywhere it's
 * allowed and falls back to `:name:` once it's deleted. Typing `:name:` in a community turns into that community's
 * emoji when it has one by that name.
 */
export const EMOJI_TOKEN = /<:([a-z0-9_]{2,32}):([a-f0-9]{24})>/g;
export const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
/** emoji ids in a text */
export const emojiIdsIn = (text: string) => [...new Set([...text.matchAll(EMOJI_TOKEN)].map((m) => m[2]))];
