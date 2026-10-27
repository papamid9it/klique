/**
 * Animations: "device" (the default) follows the device's reduce-motion setting; "on" / "off" are the person's own
 * choice, kept on this device like data saver. It's marked on <html data-motion="on|off"> so the CSS motion rules
 * (globals.css, and Tailwind's motion-reduce / motion-safe) follow it too.
 */
export type MotionPref = "device" | "on" | "off";

const KEY = "klique:motion";
const QUERY = "(prefers-reduced-motion: reduce)";

function readPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "device";
  } catch {
    return "device";
  }
}

const listeners = new Set<() => void>();
let pref: MotionPref | null = null;
let deviceReduce = false;

function mark() {
  if (pref === "device") delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = pref!;
}

function ensure() {
  if (pref !== null || typeof window === "undefined") return;
  pref = readPref();
  const m = window.matchMedia(QUERY);
  deviceReduce = m.matches;
  m.addEventListener("change", () => {
    deviceReduce = m.matches;
    listeners.forEach((l) => l());
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    pref = readPref();
    mark();
    listeners.forEach((l) => l());
  });
  mark();
}

/** Motion should stop right now (always false on the server, so the first paint is the same everywhere). */
export function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  ensure();
  return pref === "off" || (pref === "device" && deviceReduce);
}

export function setMotion(next: MotionPref) {
  try {
    if (next === "device") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private mode: it still applies for this visit */
  }
  ensure();
  pref = next;
  mark();
  listeners.forEach((l) => l());
}

/** for the useMotion hook */
export const subscribeMotion = (l: () => void) => {
  ensure();
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const motionState = () => {
  ensure();
  return { pref: pref ?? ("device" as MotionPref), deviceReduce };
};
