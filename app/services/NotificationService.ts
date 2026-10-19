import ApiClient from "@/app/ApiCore";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();

/**
 * Browser notifications for the web app (desktop browsers, phone browsers and klique installed as an app).
 * The mobile app uses PushService (Expo) instead.
 */
export type WebPushState = "unsupported" | "unavailable" | "denied" | "off" | "on";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export const NotificationService = {
  async state(): Promise<WebPushState> {
    if (!supported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    const key = (await api.get<Envelope<{ publicKey: string | null }>>("/api/me/web-push", undefined, { ttl: 300 })).data.publicKey;
    if (!key) return "unavailable";
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  },

  /** Ask the browser for permission and register this device. Must be called from a click. */
  async enable(): Promise<WebPushState> {
    if (!supported()) return "unsupported";
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "off";
    const key = (await api.get<Envelope<{ publicKey: string | null }>>("/api/me/web-push")).data.publicKey;
    if (!key) return "unavailable";
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await api.post("/api/me/web-push", { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() });
    return "on";
  },

  async disable(): Promise<WebPushState> {
    if (!supported()) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.delete("/api/me/web-push", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    return "off";
  },

  /** Keep the server's copy fresh (browsers rotate subscriptions); call on app start. */
  async refresh() {
    if (!supported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await api.post("/api/me/web-push", { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() }).catch(() => {});
  },
};
