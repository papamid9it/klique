/**
 * Which links in a chat message get an embed, shared by the server (which fetches link previews when a message is
 * sent, and saves them on it) and the web and phone apps (which draw them). Pure: no network.
 */

export type EmbedKind =
  | { type: "youtube"; id: string }
  | { type: "vimeo"; id: string }
  | { type: "video"; src: string }
  | { type: "image"; src: string }
  | { type: "link" };

const YT_ID = /^[\w-]{11}$/;

export function classifyUrl(raw: string): EmbedKind {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { type: "link" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { type: "link" };
  const host = u.hostname.replace(/^(www|m|music)\./, "").toLowerCase();
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return { type: "youtube", id: v };
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return { type: "youtube", id: m[1] };
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1, 12);
    if (YT_ID.test(id)) return { type: "youtube", id };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/\/(\d{5,12})(?:\/|$)/);
    if (m) return { type: "vimeo", id: m[1] };
  }
  if (/\.(mp4|webm|m4v|mov|ogv)$/i.test(u.pathname)) return { type: "video", src: u.toString() };
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(u.pathname)) return { type: "image", src: u.toString() };
  return { type: "link" };
}

const URL_RX = /https?:\/\/[^\s<]+/g;

/** Up to `max` distinct links in a message (trailing punctuation trimmed). */
export function linksIn(body: string, max = 3): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(URL_RX)) {
    const url = m[0].replace(/[.,!?;:)\]]+$/, "");
    if (!out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/** The links whose card needs a fetched preview (a page, or Vimeo for its picture); the rest draw from the link alone. */
export const previewLinks = (body: string) => linksIn(body).filter((u) => {
  const k = classifyUrl(u).type;
  return k === "link" || k === "vimeo";
});

/** A preview picture's frame: its own shape when known (kept between tall and wide limits), else the usual 1.91:1. */
export function previewAspect(w?: number | null, h?: number | null): number {
  if (!w || !h) return 1.91;
  return Math.min(2.4, Math.max(0.8, w / h));
}
