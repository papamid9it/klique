"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import ApiClient from "@/app/ApiCore";
import { cdn } from "@/lib/cdn";
import { EMOJI_TOKEN, emojiIdsIn } from "@/lib/emoji-tokens";

/** big emoji in a message that's only emoji (Discord's jumbo size) */
export const JUMBO_PX = 48;
import type { Envelope } from "@/lib/types";

const api = new ApiClient();
type E = { id: string; name: string; url: string; animated: boolean };

// one shared cache for every message on screen; ids asked for together go in one request
const known = new Map<string, E | null>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function request(ids: string[]) {
  let added = false;
  for (const id of ids) {
    if (known.has(id) || waiting.has(id)) continue;
    waiting.add(id);
    added = true;
  }
  if (!added || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...waiting].slice(0, 200);
    batch.forEach((id) => waiting.delete(id));
    try {
      const res = await api.get<Envelope<Record<string, E>>>(`/api/emoji?ids=${batch.join(",")}`);
      for (const id of batch) known.set(id, res.data[id] ?? null);
    } catch {
      for (const id of batch) known.set(id, null);
    }
    listeners.forEach((l) => l());
    if (waiting.size) request([]);
  }, 30);
}

/**
 * Text with custom emoji (`<:name:id>`) as little pictures; unknown or deleted ones read `:name:`. Inline they're the
 * a little bigger than a normal emoji (1.6em of the text around them); `jumbo` (a message that's only emoji) shows
 * them at 48px. `size` sets a fixed size in pixels instead.
 */
export function EmojiText({ text, size, jumbo }: { text: string; size?: number; jumbo?: boolean }) {
  const ids = emojiIdsIn(text);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ids.length) return;
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    request(ids);
    return () => void listeners.delete(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);
  if (!ids.length) return <>{text}</>;
  const box = jumbo ? `${JUMBO_PX}px` : size ? `${size}px` : "1.6em";
  // asked for at twice the largest size it shows, for sharp screens
  const ask = (jumbo ? JUMBO_PX : (size ?? 32)) * 2;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={`t${at}`}>{text.slice(last, at)}</Fragment>);
    const e = known.get(m[2]);
    out.push(
      e === undefined ? (
        // still loading: keep its place (never flash ":name:" first)
        <span key={`e${at}`} aria-label={`:${m[1]}:`} className={jumbo ? "mr-1 inline-block align-bottom" : "mx-px inline-block align-[-0.35em]"} style={{ width: box, height: box }} />
      ) : e ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`e${at}`} src={e.animated ? e.url : cdn(e.url, { w: ask })} alt={`:${e.name}:`} title={`:${e.name}:`} loading="lazy" className={jumbo ? "mr-1 inline-block object-contain align-bottom" : "mx-px inline-block object-contain align-[-0.35em]"} style={{ width: box, height: box }} />
      ) : (
        <Fragment key={`e${at}`}>{`:${m[1]}:`}</Fragment>
      ),
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
