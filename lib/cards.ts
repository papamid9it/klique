/**
 * Cards: what bots and webhooks can post besides plain words. They describe a card and each app draws it in its own
 * way, in the viewer's colours. They never send their own code, so a card can't run anything or pass for Klique's own
 * screens. The server checks them in server/services/cards.ts.
 */

export const CARD_LIMITS = {
  cards: 4,
  title: 200,
  text: 2000,
  fields: 10,
  fieldName: 80,
  fieldValue: 500,
  footer: 200,
  buttons: 5,
  buttonLabel: 40,
  buttonId: 100,
  url: 600,
  /** all the words in one message's cards */
  total: 6000,
} as const;

export interface CardField {
  name: string;
  value: string;
  /** sits beside other inline fields where there's room */
  inline?: boolean;
}

export interface CardButton {
  label: string;
  style?: "primary" | "secondary" | "danger";
  /** pressing it tells the bot, with this id. A button has an id or a url, never both. */
  id?: string;
  /** pressing it opens this link */
  url?: string;
  disabled?: boolean;
}

export interface MessageCard {
  /** "#rrggbb": the stripe down the card's side */
  color?: string;
  title?: string;
  /** the title opens this link */
  url?: string;
  /** **bold**, *italic*, `code`, line breaks and plain links */
  text?: string;
  /** a large picture */
  image?: string;
  /** a small picture in the corner */
  thumbnail?: string;
  fields?: CardField[];
  footer?: string;
  buttons?: CardButton[];
}

export interface CardSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  url?: string;
}

const SPAN_RX = /(https?:\/\/[^\s<]+)|`([^`\n]+)`|\*\*([^\n]+?)\*\*|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g;

/** A card's words, split into their styles. Everything stays plain text: no web code ever gets through. */
export function cardSpans(text: string): CardSpan[] {
  const out: CardSpan[] = [];
  let last = 0;
  for (const m of text.matchAll(SPAN_RX)) {
    const at = m.index;
    if (at > last) out.push({ text: text.slice(last, at) });
    if (m[1]) {
      const url = m[1].replace(/[.,!?;:)\]*]+$/, "");
      out.push({ text: url, url });
      if (m[1].length > url.length) out.push({ text: m[1].slice(url.length) });
    } else if (m[2]) out.push({ text: m[2], code: true });
    else if (m[3]) out.push({ text: m[3], bold: true });
    else out.push({ text: m[4], italic: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** All of a card's words, for AutoMod and for moderators reading a report. */
export function cardWords(cards: MessageCard[] | null | undefined): string {
  return (cards ?? [])
    .flatMap((c) => [c.title, c.text, ...(c.fields ?? []).flatMap((f) => [f.name, f.value]), c.footer, ...(c.buttons ?? []).map((b) => b.label)])
    .filter(Boolean)
    .join("\n");
}

/** One line about a message that is only a card, for reply quotes, notifications and pinned bars. */
export function cardPreview(cards: MessageCard[] | null | undefined): string {
  const c = cards?.[0];
  if (!c) return "";
  const words = (c.title || c.text || c.fields?.[0]?.name || c.footer || "").replace(/\*|`/g, "").replace(/\s+/g, " ").trim();
  return words || (c.image || c.thumbnail ? "Photo" : "Card");
}
