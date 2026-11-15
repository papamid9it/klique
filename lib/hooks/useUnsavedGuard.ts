"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { useConfirm, type ConfirmOptions } from "@/components/providers/ConfirmProvider";

/*
 * "You have unsaved changes": a form with changes not saved yet registers here (useUnsavedGuard(dirty)). While any is
 * registered, leaving asks first, Keep editing or Discard: clicking a link, the browser's Back, closing or switching
 * settings (confirmLeave). Reloading or closing the tab gets the browser's own "Leave site?" (browsers allow no other).
 */

const dirtyForms = new Set<string>();
let ask: ((o: ConfirmOptions) => Promise<boolean>) | null = null;
let push: ((href: string) => void) | null = null;
let installed = false;
let asking = false;
// leaving on purpose (they chose Discard): the history step stays put
let discarding = false;
// a Back we made ourselves (taking our extra step away): not theirs, so not asked about
let ourBack = false;

const QUESTION: ConfirmOptions = { title: "Discard your changes?", body: "You haven't saved them. Leave and they're gone.", confirmLabel: "Discard", cancelLabel: "Keep editing" };

/** Ask before leaving when something isn't saved. True: go ahead (nothing unsaved, or they chose Discard). */
export async function confirmLeave(): Promise<boolean> {
  if (!dirtyForms.size || !ask) return true;
  if (asking) return false;
  asking = true;
  try {
    const ok = await ask(QUESTION);
    if (ok) {
      discarding = true;
      dirtyForms.clear();
      setTimeout(() => (discarding = false), 0);
    }
    return ok;
  } finally {
    asking = false;
  }
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("beforeunload", (e) => {
    if (!dirtyForms.size) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // links: caught before the page's own handlers run, so nothing changes until they answer
  document.addEventListener(
    "click",
    (e) => {
      if (!dirtyForms.size || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // another site: the browser's "Leave site?" covers it
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // a #hash on the same page
      e.preventDefault();
      e.stopPropagation();
      void confirmLeave().then((ok) => ok && push?.(url.pathname + url.search + url.hash));
    },
    true,
  );

  // the browser's Back: an extra history step (a copy of this page's own, so the router is happy) catches it
  window.addEventListener("popstate", () => {
    if (ourBack) {
      ourBack = false;
      return;
    }
    if (!dirtyForms.size) return;
    window.history.pushState({ ...window.history.state, kqGuard: true }, "", window.location.href);
    void confirmLeave().then((ok) => {
      if (ok) window.history.go(-2);
    });
  });
}

/** Register a form's unsaved changes: while `dirty`, leaving the page asks first. */
export function useUnsavedGuard(dirty: boolean) {
  const id = useId();
  const confirm = useConfirm();
  const router = useRouter();
  useEffect(() => {
    ask = confirm;
    push = router.push;
    install();
  }, [confirm, router]);
  useEffect(() => {
    if (!dirty) return;
    // the step the browser's Back lands on: the same page, so going back once stays here and asks
    if (!dirtyForms.size) window.history.pushState({ ...window.history.state, kqGuard: true }, "", window.location.href);
    dirtyForms.add(id);
    return () => {
      if (!dirtyForms.delete(id) || dirtyForms.size || discarding) return;
      // saved (or reset): take our extra step back out, quietly, so the next Back really goes back
      if ((window.history.state as { kqGuard?: boolean } | null)?.kqGuard) {
        ourBack = true;
        window.history.back();
      }
    };
  }, [dirty, id]);
}
