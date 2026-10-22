/**
 * Data saver: lighter pictures (the 640px copies), GIFs and videos wait for a tap, nothing is fetched in the
 * background for pages you haven't opened, and chats check for new messages less often.
 *
 * "auto" (the default) turns it on by itself when the browser says data is precious: the Save-Data setting,
 * or a 2G/3G connection. "on" / "off" are the person's own choice, kept on this device (each phone or laptop
 * has its own connection, so it doesn't follow the account).
 */
export type DataSaverPref = "auto" | "on" | "off";

const KEY = "klique:data-saver";

type NetInfo = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
const net = (): NetInfo | undefined => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: NetInfo }).connection);

/** what the browser reports: Save-Data on, or a slow connection */
export function connectionIsSlow(): boolean {
  const c = net();
  return !!c && (!!c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType ?? ""));
}

function readPref(): DataSaverPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

const listeners = new Set<() => void>();
let pref: DataSaverPref | null = null;
let slow = false;
let watching = false;

function refresh() {
  pref = readPref();
  slow = connectionIsSlow();
  listeners.forEach((l) => l());
}

function ensure() {
  if (pref !== null || typeof window === "undefined") return;
  pref = readPref();
  slow = connectionIsSlow();
  if (!watching) {
    watching = true;
    net()?.addEventListener?.("change", refresh);
    window.addEventListener("storage", (e) => e.key === KEY && refresh());
  }
}

/** Data saver is on right now (always false on the server, so the first paint is the same everywhere). */
export function isDataSaver(): boolean {
  if (typeof window === "undefined") return false;
  ensure();
  return pref === "on" || (pref === "auto" && slow);
}

export function setDataSaver(next: DataSaverPref) {
  try {
    if (next === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private mode: it still applies for this visit */
  }
  pref = next;
  listeners.forEach((l) => l());
}

/** for the useDataSaver hook */
export const subscribeDataSaver = (l: () => void) => {
  ensure();
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const dataSaverState = () => {
  ensure();
  return { pref: pref ?? ("auto" as DataSaverPref), slow };
};

export const isGif = (url: string) => /\.gif($|[?#])/i.test(url);
