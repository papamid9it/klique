/**
 * A community's tags (Reddit's flair): its own labels, such as Question, Recap or Meetup, each with a colour. Its
 * owner and admins set them up in the community's settings; whoever posts there picks one (or none) for the post. It
 * shows as a small coloured tag above the post's title, and tapping it shows the community's posts with that tag.
 * (#words typed in a title are something else: they're shared across all of Klique, see /tags/<word>.)
 */
export const POST_TAGS_MAX = 10;
export const POST_TAG_NAME_MAX = 24;

export const POST_TAG_COLORS = [
  { id: "green", bg: "#7DD87D", ink: "#0b0b0c" },
  { id: "gold", bg: "#F5B83D", ink: "#0b0b0c" },
  { id: "blue", bg: "#6CB4FF", ink: "#0b0b0c" },
  { id: "pink", bg: "#FF7EB6", ink: "#0b0b0c" },
  { id: "purple", bg: "#B18CFF", ink: "#0b0b0c" },
  { id: "red", bg: "#FF5C5C", ink: "#ffffff" },
  { id: "orange", bg: "#FF9F43", ink: "#0b0b0c" },
  { id: "teal", bg: "#3DD6C6", ink: "#0b0b0c" },
  { id: "grey", bg: "#A1A1AA", ink: "#0b0b0c" },
  { id: "black", bg: "#18181B", ink: "#ffffff" },
] as const;

export type PostTagColor = (typeof POST_TAG_COLORS)[number]["id"];
export const POST_TAG_COLOR_IDS = POST_TAG_COLORS.map((c) => c.id) as [PostTagColor, ...PostTagColor[]];
export const postTagColor = (id: string | null | undefined) => POST_TAG_COLORS.find((c) => c.id === id) ?? POST_TAG_COLORS[0];
