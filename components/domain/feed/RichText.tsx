"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { VerifiedCheck } from "@/components/ui/VerifiedCheck";
import type { TextRefsDTO } from "@/lib/types";

/** links, @people / @communities, and #tags, in one pass */
const TOKEN_RX = /(https?:\/\/[^\s<]+)|(?<![\w@])@([a-zA-Z0-9][a-zA-Z0-9_-]{1,39})(?![\w-])|(?<![\w#&/])#([a-zA-Z][a-zA-Z0-9_]{1,29})(?![\w])/g;

/**
 * A post's or comment's text: links open in a new tab, @people open their card, @communities are a chip (with the
 * verified badge) to the community, #tags go to /tags/<tag>. Only names the server resolved (`refs`) become links:
 * anything else stays plain text. Never injects HTML.
 */
export function RichText({ text, refs }: { text: string; refs?: TextRefsDTO | null }) {
  const people = new Map((refs?.users ?? []).map((u) => [u.handle.toLowerCase(), u]));
  const communities = new Map((refs?.communities ?? []).map((c) => [c.slug.toLowerCase(), c]));
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RX)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1]) {
      const url = m[1].replace(/[.,!?;:)\]]+$/, "");
      out.push(
        <a key={at} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-accent-text underline underline-offset-2 hover:opacity-80">
          {url}
        </a>,
      );
      out.push(m[1].slice(url.length));
    } else if (m[2]) {
      const key = m[2].toLowerCase();
      const person = people.get(key);
      const community = communities.get(key);
      if (person) {
        out.push(
          <ProfileTrigger key={at} handle={person.handle} className="font-semibold text-accent-text hover:underline">
            @{person.handle}
          </ProfileTrigger>,
        );
      } else if (community) {
        out.push(
          <Link key={at} href={`/communities/${community.slug}`} className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-px align-baseline text-[0.92em] font-semibold text-ink hover:underline">
            {community.name}
            <VerifiedCheck on={community.verified} size={12} />
          </Link>,
        );
      } else out.push(m[0]);
    } else if (m[3]) {
      out.push(
        <Link key={at} href={`/tags/${m[3].toLowerCase()}`} className="font-medium text-accent-text hover:underline">
          #{m[3]}
        </Link>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => (typeof n === "string" ? <Fragment key={`t${i}`}>{n}</Fragment> : n))}</>;
}
