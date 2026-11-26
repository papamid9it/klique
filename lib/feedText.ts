/**
 * Posts without pictures or a video, shared by the server (validation) and every client (rendering).
 * Short text with no title is a "card": a coloured 4:3 card in the picture's place, opened like a video post.
 * A title, or text longer than TEXT_CARD_MAX, makes it a "long" post, Reddit style: a title (required past the
 * limit) and the body, opened as one column with the comments under it.
 */
export const TEXT_CARD_MAX = 220;
export const FEED_TITLE_MAX = 120;

/** The card backgrounds a poster picks from (the card's text colour goes with each). */
export const TEXT_BACKGROUNDS = [
  { id: "sunset", name: "Sunset", css: "linear-gradient(160deg, #ff6a3d 0%, #c2185b 100%)", ink: "#ffffff" },
  { id: "dusk", name: "Dusk", css: "linear-gradient(160deg, #1b1f3a 0%, #3a1c71 55%, #d76d77 100%)", ink: "#ffffff" },
  { id: "ocean", name: "Ocean", css: "linear-gradient(160deg, #0f2027 0%, #2c5364 60%, #4ca1af 100%)", ink: "#ffffff" },
  { id: "forest", name: "Forest", css: "linear-gradient(160deg, #134e5e 0%, #2f8f5b 100%)", ink: "#ffffff" },
  { id: "lime", name: "Lime", css: "#c8f560", ink: "#0a0a0a" },
  { id: "paper", name: "Paper", css: "#f4f4f2", ink: "#0a0a0a" },
  { id: "ink", name: "Ink", css: "#161616", ink: "#f4f4f2" },
] as const;

export type TextBackgroundId = (typeof TEXT_BACKGROUNDS)[number]["id"];
export const TEXT_BACKGROUND_IDS = TEXT_BACKGROUNDS.map((b) => b.id) as [TextBackgroundId, ...TextBackgroundId[]];
export const textBackground = (id: string | null | undefined) => TEXT_BACKGROUNDS.find((b) => b.id === id) ?? TEXT_BACKGROUNDS[0];

export type TextStyle = "card" | "long";

/**
 * How a post without media shows (null: it has pictures or a video). A title on its own with a colour picked is a
 * card (the title big on the colour); older posts with short text and no title were cards too. Anything else (a title
 * with text, or no colour) is a text post: the title, then the first lines.
 */
export function textStyleOf(p: { media: readonly unknown[]; title?: string | null; caption: string; textBg?: string | null }): TextStyle | null {
  if (p.media.length) return null;
  const title = p.title?.trim() ?? "";
  const text = p.caption.trim();
  if (title && !text && p.textBg) return "card";
  if (!title && text && text.length <= TEXT_CARD_MAX) return "card";
  return "long";
}

/** The words a colour card shows: its text, or (a title-only post on a colour) its title. */
export const cardText = (p: { caption: string; title?: string | null }) => p.caption.trim() || p.title?.trim() || "";
