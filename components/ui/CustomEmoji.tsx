"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import ApiClient from "@/app/ApiCore";
import { cdn } from "@/lib/cdn";
import { EMOJI_TOKEN, emojiIdsIn } from "@/lib/emoji-tokens";
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

/** Text with custom emoji (`<:name:id>`) as little pictures; unknown or deleted ones read `:name:`. */
export function EmojiText({ text, size = 22 }: { text: string; size?: number }) {
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
  // a message that's only emoji shows them bigger, like Discord
  const onlyEmoji = !text.replace(EMOJI_TOKEN, "").trim();
  const px = onlyEmoji ? Math.round(size * 2) : size;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={`t${at}`}>{text.slice(last, at)}</Fragment>);
    const e = known.get(m[2]);
    out.push(
      e ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`e${at}`} src={e.animated ? e.url : cdn(e.url, { w: px * 2 })} alt={`:${e.name}:`} title={`:${e.name}:`} width={px} height={px} loading="lazy" className="inline-block object-contain align-[-0.3em]" style={{ width: px, height: px }} />
      ) : (
        <Fragment key={`e${at}`}>{`:${m[1]}:`}</Fragment>
      ),
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
