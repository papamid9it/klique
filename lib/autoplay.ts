/**
 * Autoplay videos: feed videos play by themselves (muted, on a loop) as they scroll into view. On by default;
 * the person can turn it off, kept on this device like data saver. Data saver on stops autoplay whatever this says.
 */
const KEY = "klique:autoplay";

const listeners = new Set<() => void>();
let on: boolean | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** Autoplay is allowed (on the server: yes, so the first paint matches) */
export function isAutoplay(): boolean {
  if (typeof window === "undefined") return true;
  if (on === null) {
    on = read();
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      on = read();
      listeners.forEach((l) => l());
    });
  }
  return on;
}

export function setAutoplay(next: boolean) {
  try {
    if (next) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    /* private mode: it still applies for this visit */
  }
  on = next;
  listeners.forEach((l) => l());
}

export const subscribeAutoplay = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
