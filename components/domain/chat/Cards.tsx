"use client";

import { Fragment, useState } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cardSpans, type CardButton, type MessageCard } from "@/lib/cards";

/** A card's words: **bold**, *italic*, `code`, line breaks and plain links. Never injects HTML, and never pings anyone. */
function Words({ text }: { text: string }) {
  return (
    <>
      {cardSpans(text).map((s, i) =>
        s.url ? (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-accent-text underline underline-offset-2 hover:opacity-80">
            {s.text}
          </a>
        ) : s.code ? (
          <code key={i} className="rounded bg-raised px-1 py-px font-mono text-[0.9em] text-ink">
            {s.text}
          </code>
        ) : s.bold ? (
          <strong key={i} className="font-semibold text-ink">
            {s.text}
          </strong>
        ) : s.italic ? (
          <em key={i}>{s.text}</em>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

/** A picture from wherever the bot keeps it, like a picture link in a message. It disappears if it won't load. */
function Picture({ src, className }: { src: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer nofollow ugc" className="block">
      <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={className} />
    </a>
  );
}

const VARIANT = { primary: "primary", danger: "danger", secondary: "secondary" } as const;

function CardButtonView({ b, onPress }: { b: CardButton; onPress?: (buttonId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const variant = VARIANT[b.style ?? "secondary"];
  if (b.url && !b.disabled) {
    return (
      <a href={b.url} target="_blank" rel="noopener noreferrer nofollow ugc" className={buttonClass(variant, "sm")}>
        {b.label}
        <Icon name="arrow-up-right" size={13} />
      </a>
    );
  }
  return (
    <Button
      size="sm"
      variant={variant}
      loading={busy}
      disabled={b.disabled || !b.id || !onPress || busy}
      onClick={() => {
        if (!b.id || !onPress) return;
        setBusy(true);
        void onPress(b.id).finally(() => setBusy(false));
      }}
    >
      {b.label}
    </Button>
  );
}

/** The cards a bot or webhook posted, in the viewer's own colours: only the stripe is the bot's. */
export function Cards({ cards, onPress }: { cards: MessageCard[]; /** left out: you can see the buttons but can't press them (not a member) */ onPress?: (buttonId: string) => Promise<void> }) {
  return (
    <div className="mt-1 space-y-2">
      {cards.map((c, i) => (
        <div key={i} className="max-w-md overflow-hidden rounded-card border border-l-4 border-line bg-surface p-3" style={c.color ? { borderLeftColor: c.color } : undefined}>
          {c.thumbnail && (
            <div className="float-right mb-1 ml-3">
              <Picture src={c.thumbnail} className="size-16 rounded-control object-cover" />
            </div>
          )}
          {c.title &&
            (c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="block text-[15px] font-semibold break-words text-accent-text hover:underline">
                {c.title}
              </a>
            ) : (
              <p className="text-[15px] font-semibold break-words text-ink">{c.title}</p>
            ))}
          {c.text && (
            <p className="mt-1 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink-muted first:mt-0">
              <Words text={c.text} />
            </p>
          )}
          {!!c.fields?.length && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 first:mt-0">
              {c.fields.map((f, j) => (
                <div key={j} className={f.inline ? "min-w-0" : "col-span-2 min-w-0"}>
                  <dt className="text-[13px] font-semibold break-words text-ink">{f.name}</dt>
                  <dd className="text-[13px] leading-relaxed break-words whitespace-pre-wrap text-ink-muted">
                    <Words text={f.value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {c.image && (
            <div className="clear-both mt-2 first:mt-0">
              <Picture src={c.image} className="max-h-80 w-full rounded-control object-cover" />
            </div>
          )}
          {c.footer && <p className="clear-both mt-2 text-[12px] break-words text-ink-muted first:mt-0">{c.footer}</p>}
          {!!c.buttons?.length && (
            <div className="clear-both mt-2.5 flex flex-wrap gap-2">
              {c.buttons.map((b, j) => (
                <CardButtonView key={b.id ?? `${j}`} b={b} onPress={onPress} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
