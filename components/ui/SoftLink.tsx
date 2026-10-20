"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { isSamePage, softNavigate } from "@/lib/nav";

/**
 * A Link that, when it only changes the query of the page you're on, switches instantly in the browser instead
 * of a server round trip (see softNavigate). Anything else, and new-tab clicks, behave like a normal Link.
 */
export function SoftLink({ href, onClick, replace, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isSamePage(href)) return;
    e.preventDefault();
    softNavigate(href, { replace });
  };
  return <Link href={href} onClick={handle} replace={replace} {...rest} />;
}
