/**
 * GIPHY stickers for the sticker picker: search by word, or trending when nothing's typed. Asked straight from the
 * browser (GIPHY's keys are made for apps), so it costs Klique's server nothing; the pictures come from GIPHY too.
 * Without NEXT_PUBLIC_GIPHY_API_KEY the tab simply doesn't show. Rated PG-13 at most. (The phone app has its own copy.)
 */
const KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";
export const giphyOn = !!KEY;

export type GiphySticker = { id: string; url: string; width: number; height: number; title: string };

type Raw = { id: string; title?: string; images?: { fixed_width?: { webp?: string; url?: string; width?: string; height?: string } } };

export async function giphyStickers(q: string, offset = 0): Promise<{ items: GiphySticker[]; more: boolean }> {
  if (!KEY) return { items: [], more: false };
  const term = q.trim();
  const base = term ? "https://api.giphy.com/v1/stickers/search" : "https://api.giphy.com/v1/stickers/trending";
  const params = new URLSearchParams({ api_key: KEY, limit: "24", offset: String(offset), rating: "pg-13", lang: "en", ...(term ? { q: term } : {}) });
  const res = await fetch(`${base}?${params}`);
  if (!res.ok) throw new Error("GIPHY isn't answering right now.");
  const body = (await res.json()) as { data: Raw[]; pagination?: { total_count?: number; count?: number; offset?: number } };
  const items = body.data.flatMap((g) => {
    const f = g.images?.fixed_width;
    const url = f?.webp || f?.url;
    return url ? [{ id: g.id, url, width: Number(f?.width) || 200, height: Number(f?.height) || 200, title: g.title ?? "" }] : [];
  });
  const total = body.pagination?.total_count ?? 0;
  return { items, more: offset + items.length < Math.min(total, 500) };
}
