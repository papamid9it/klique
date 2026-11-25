/**
 * Was this page opened from outside Klique (a shared link, a new tab, typed in), or reached by moving around inside it?
 * Like Discord: a community link from outside shows its invite card; browsing inside Klique can preview it.
 * The first page of a visit is where you came in; any move inside Klique after that is browsing.
 */
let entry: string | null = null;
let moved = false;

/** Called with each page path as the visit goes on (the analytics provider sees every one). */
export function notePath(path: string) {
  if (entry === null) entry = path;
  else if (path !== entry) moved = true;
}

/** This path is where the visit came in, and nothing has been opened inside Klique since. */
export const openedFromOutside = (path: string) => !moved && (entry === null || entry === path);
