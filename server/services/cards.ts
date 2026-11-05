import { z } from "zod";
import { CARD_LIMITS as L, cardWords, type MessageCard } from "@/lib/cards";

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i;

/** A public https link: never a script, a phone's own files, somebody's home network or a "name@" disguise. */
function publicHttps(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && !PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

const link = (what: string) => z.string().trim().max(L.url, `${what}: that link is too long.`).refine(publicHttps, `${what} must be a public https link.`);

const button = z
  .object({
    label: z.string().trim().min(1, "A button needs a label.").max(L.buttonLabel, `Button labels can be up to ${L.buttonLabel} characters.`),
    style: z.enum(["primary", "secondary", "danger"]).optional(),
    id: z.string().trim().min(1).max(L.buttonId).optional(),
    url: link("A button's url").optional(),
    disabled: z.boolean().optional(),
  })
  .refine((b) => !!b.id !== !!b.url, "A button needs an id or a url, not both.");

const card = z
  .object({
    color: z.string().regex(/^#[0-9a-f]{6}$/i, 'color must look like "#5865f2".').optional(),
    title: z.string().trim().max(L.title, `A card's title can be up to ${L.title} characters.`).optional(),
    url: link("A card's url").optional(),
    text: z.string().trim().max(L.text, `A card's text can be up to ${L.text} characters.`).optional(),
    image: link("A card's image").optional(),
    thumbnail: link("A card's thumbnail").optional(),
    fields: z
      .array(
        z.object({
          name: z.string().trim().min(1, "A field needs a name.").max(L.fieldName),
          value: z.string().trim().min(1, "A field needs a value.").max(L.fieldValue),
          inline: z.boolean().optional(),
        }),
      )
      .max(L.fields, `A card can have up to ${L.fields} fields.`)
      .optional(),
    footer: z.string().trim().max(L.footer).optional(),
    buttons: z.array(button).max(L.buttons, `A card can have up to ${L.buttons} buttons.`).optional(),
  })
  .refine((c) => !!(c.title || c.text || c.image || c.thumbnail || c.fields?.length || c.footer), "A card needs something to show.");

export const cardsSchema = z
  .array(card)
  .max(L.cards, `A message can have up to ${L.cards} cards.`)
  .refine((cards) => cardWords(cards).length <= L.total, `A message's cards can hold up to ${L.total} characters.`)
  .refine((cards) => {
    const ids = cards.flatMap((c) => c.buttons ?? []).flatMap((b) => (b.id ? [b.id] : []));
    return new Set(ids).size === ids.length;
  }, "Each button in a message needs its own id.") satisfies z.ZodType<MessageCard[]>;

/** Webhooks have nobody listening, so their buttons can only be links. */
export const webhookCardsSchema = cardsSchema.refine((cards) => cards.every((c) => (c.buttons ?? []).every((b) => !b.id)), "A webhook's buttons need a url: it can't hear them being pressed.");

/** What a bot sends or answers with: words, cards or both. */
export const botMessageSchema = z
  .object({ content: z.string().trim().max(2000).optional(), cards: cardsSchema.optional() })
  .refine((m) => !!m.content || !!m.cards?.length, "Send `content`, `cards` or both.");
