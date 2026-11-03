"use client";

import { useEffect, useRef, useState } from "react";
import ApiClient from "@/app/ApiCore";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";
import { cx } from "@/components/ui/cx";
import { useDebounced } from "@/lib/hooks/useApi";
import { activeToken } from "@/lib/tags";
import type { Envelope, UserBrief } from "@/lib/types";

const api = new ApiClient();
type Suggestions = { tags: string[]; people: UserBrief[]; communities: { slug: string; name: string; verified: boolean }[] };
type Option = { kind: "person"; u: UserBrief } | { kind: "community"; c: Suggestions["communities"][number] } | { kind: "tag"; tag: string };

/**
 * "@que" (people and communities) and "#que" (tags) suggestions while writing a post or a comment. Give it the box
 * (`target`) and its text; it shows the list under the box and fills in the pick. `onKeyDown` lets the box hand it
 * ↑ ↓ Enter Tab Escape while the list is open (returns true when it used the key).
 */
export function useTagSuggest(target: React.RefObject<HTMLTextAreaElement | null>, value: string, setValue: (v: string) => void) {
  const [token, setToken] = useState<ReturnType<typeof activeToken>>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [active, setActive] = useState(0);
  const q = useDebounced(token ? `${token.kind}${token.query}` : null, 150);
  const ticket = useRef(0);

  // where the caret is: re-read after every change
  useEffect(() => {
    const el = target.current;
    setToken(el ? activeToken(value, el.selectionStart ?? value.length) : null);
  }, [value, target]);

  useEffect(() => {
    if (!q || (q.length < 2 && q[0] === "@")) {
      setOptions([]);
      return;
    }
    const mine = ++ticket.current;
    api.get<Envelope<Suggestions>>("/api/tags/suggest", { kind: q[0], q: q.slice(1) }).then(
      (r) => {
        if (mine !== ticket.current) return;
        setOptions([...r.data.people.map((u) => ({ kind: "person" as const, u })), ...r.data.communities.map((c) => ({ kind: "community" as const, c })), ...r.data.tags.map((tag) => ({ kind: "tag" as const, tag }))]);
        setActive(0);
      },
      () => mine === ticket.current && setOptions([]),
    );
  }, [q]);

  const open = !!token && options.length > 0;
  function pick(o: Option) {
    const el = target.current;
    if (!token || !el) return;
    const caret = el.selectionStart ?? value.length;
    const word = o.kind === "person" ? `@${o.u.handle}` : o.kind === "community" ? `@${o.c.slug}` : `#${o.tag}`;
    const next = `${value.slice(0, token.start)}${word} ${value.slice(caret)}`;
    const pos = token.start + word.length + 1;
    setValue(next);
    setOptions([]);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(options[active]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOptions([]);
      return true;
    }
    return false;
  }

  const panel = open ? (
    <ul role="listbox" aria-label={token?.kind === "#" ? "Tags" : "Tag someone or a community"} className="z-20 mt-1 max-h-60 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-lg">
      {options.map((o, i) => (
        <li
          key={o.kind === "person" ? o.u.id : o.kind === "community" ? `c:${o.c.slug}` : `t:${o.tag}`}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            pick(o);
          }}
          onMouseEnter={() => setActive(i)}
          className={cx("flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-1.5 text-sm", i === active && "bg-raised")}
        >
          {o.kind === "person" ? (
            <>
              <Avatar name={o.u.displayName} src={o.u.avatarUrl} size={24} />
              <span className="min-w-0 flex-1 truncate font-semibold">{o.u.displayName}</span>
              <span className="font-mono text-[11px] text-ink-muted">@{o.u.handle}</span>
            </>
          ) : o.kind === "community" ? (
            <>
              <span className="inline-flex size-6 items-center justify-center rounded-[7px] bg-raised text-[11px] font-bold">{o.c.name[0]}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-semibold">
                {o.c.name} <VerifiedCheck on={o.c.verified} size={12} />
              </span>
              <span className="text-[11px] text-ink-muted">Community</span>
            </>
          ) : (
            <span className="font-semibold">#{o.tag}</span>
          )}
        </li>
      ))}
    </ul>
  ) : null;

  return { panel, onKeyDown };
}
