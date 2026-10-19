/** Reactions and stickers, shared by the server (validation) and every client (rendering). Animated emoji, no assets to host. */
export const REACTIONS = [
  { id: "like", emoji: "👍", label: "Like" },
  { id: "dislike", emoji: "👎", label: "Dislike" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "laugh", emoji: "😂", label: "Laugh" },
  { id: "wow", emoji: "😮", label: "Wow" },
  { id: "cry", emoji: "😢", label: "Cry" },
  { id: "angry", emoji: "😡", label: "Angry" },
] as const;

export const STICKERS = [
  { id: "party", emoji: "🥳", label: "Party" },
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "cool", emoji: "😎", label: "Cool" },
  { id: "lol", emoji: "🤣", label: "Dying" },
  { id: "hearts", emoji: "😍", label: "Heart eyes" },
  { id: "hug", emoji: "🤗", label: "Hug" },
  { id: "wave", emoji: "👋", label: "Wave" },
  { id: "clap", emoji: "👏", label: "Clap" },
  { id: "pray", emoji: "🙏", label: "Thank you" },
  { id: "muscle", emoji: "💪", label: "Strong" },
  { id: "sob", emoji: "😭", label: "Sobbing" },
  { id: "rage", emoji: "🤬", label: "Furious" },
  { id: "shock", emoji: "😱", label: "Shocked" },
  { id: "skull", emoji: "💀", label: "Dead" },
  { id: "dance", emoji: "💃", label: "Dance" },
  { id: "hundred", emoji: "💯", label: "100" },
  { id: "eyes", emoji: "👀", label: "Eyes" },
  { id: "think", emoji: "🤔", label: "Thinking" },
  { id: "sleep", emoji: "😴", label: "Sleepy" },
  { id: "rocket", emoji: "🚀", label: "Rocket" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["id"];
export type StickerId = (typeof STICKERS)[number]["id"];

export const REACTION_IDS = REACTIONS.map((r) => r.id) as [ReactionKind, ...ReactionKind[]];
export const STICKER_IDS = STICKERS.map((s) => s.id) as [StickerId, ...StickerId[]];

export const reactionEmoji = (id: string) => REACTIONS.find((r) => r.id === id)?.emoji ?? "👍";
export const stickerOf = (id: string | null | undefined) => (id ? STICKERS.find((s) => s.id === id) ?? null : null);

/** What the counts become after `kind` is tapped, mirroring the server: same kind removes yours, another kind replaces it. */
export function applyReaction<T extends { kind: string; count: number; mine: boolean }>(list: T[], kind: ReactionKind): T[] {
  const had = list.find((r) => r.mine)?.kind;
  const next = list.map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0);
  if (had === kind) return next;
  const existing = next.find((r) => r.kind === kind);
  if (existing) return next.map((r) => (r.kind === kind ? { ...r, count: r.count + 1, mine: true } : r));
  return [...next, { kind, count: 1, mine: true } as unknown as T];
}
