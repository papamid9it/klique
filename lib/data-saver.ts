/**
 * Data saver: lighter pictures (the 640px copies), GIFs and videos wait for a tap, profile effects hold still,
 * nothing is fetched in the background for pages you haven't opened, and chats check for new messages less often.
 *
 * Off unless the person switches it on. It used to switch itself on ("automatic") when the browser reported a slow
 * connection or Save-Data, which quietly stopped feed videos playing on fine connections. A choice of "auto" saved
 * back then counts as off; "on" is kept. Kept on this device (each phone or laptop has its own connection).
 */
export type DataSaverPref = "on" | "off";

const KEY = "klique:data-saver";

function readPref(): DataSaverPref {
  try {
    return localStorage.getItem(KEY) === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

const listeners = new Set<() => void>();
let pref: DataSaverPref | null = null;
let watching = false;

function ensure() {
  if (pref !== null || typeof window === "undefined") return;
  pref = readPref();
  if (!watching) {
    watching = true;
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      pref = readPref();
      listeners.forEach((l) => l());
    });
  }
}

/** Data saver is on right now (always false on the server, so the first paint is the same everywhere). */
export function isDataSaver(): boolean {
  if (typeof window === "undefined") return false;
  ensure();
  return pref === "on";
}

export function setDataSaver(next: DataSaverPref) {
  try {
    if (next === "on") localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
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
  return { pref: pref ?? ("off" as DataSaverPref) };
};

export const isGif = (url: string) => /\.gif($|[?#])/i.test(url);
