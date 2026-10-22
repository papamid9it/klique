import "server-only";
import { ImageResponse } from "next/og";
import { cdn } from "./cdn";
import { SHARE_SIZE, ShareCard } from "./share-card";

/** What every share card says when there's nothing more specific (private, gone, or failed to load). */
export const GENERIC_SHARE = { eyebrow: "klique.", title: "Find your people." };

type Card = { eyebrow: string; title: string; lines?: string[]; image?: string | null };

/** sharp ships with Next.js; if it's ever missing, cards still render (as PNG, without a photo). */
async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/**
 * The cover photo for the card's right side, as a small JPEG data URL. Our uploads are WebP, which the card
 * renderer can't draw, so they're converted here; the 640px copy is fetched to keep it quick.
 */
async function coverFor(url: string, sharp: NonNullable<Awaited<ReturnType<typeof loadSharp>>>): Promise<string | null> {
  try {
    const res = await fetch(cdn(url, { w: 640 }), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(460, 630, { fit: "cover" })
      .jpeg({ quality: 78 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The 1200×630 picture shown when a link is shared (WhatsApp, X, iMessage…). JPEG, so it stays well under the
 * ~300KB WhatsApp is happy with (a PNG with a photo in it is several times bigger).
 */
export async function shareImage(card: Card | null): Promise<Response> {
  const c: Card = card ?? GENERIC_SHARE;
  const sharp = await loadSharp();
  const image = c.image && sharp ? await coverFor(c.image, sharp) : null;
  const png = new ImageResponse(<ShareCard eyebrow={c.eyebrow} title={c.title} lines={c.lines} image={image} />, SHARE_SIZE);
  if (!sharp) return png;
  const jpg = await sharp(Buffer.from(await png.arrayBuffer()))
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpg), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

export const SHARE_IMAGE = { ...SHARE_SIZE, type: "image/jpeg" };
