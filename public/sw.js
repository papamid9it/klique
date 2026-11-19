/* klique. service worker: shows notifications (event reminders, messages) and opens the right page when tapped. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "klique.", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "klique.";
  event.waitUntil(
    (async () => {
      // someone is looking at a klique tab right now (on screen and focused): no pop-up, like WhatsApp Web. The page
      // already shows it live; it's told so it can update its badges. A tab in the background still gets the pop-up.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const watching = windows.filter((w) => new URL(w.url).origin === self.location.origin && w.visibilityState === "visible" && w.focused);
      if (watching.length) {
        for (const w of watching) w.postMessage({ type: "klique-push", url: data.url || "/" });
        return;
      }
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/app-icon/192",
        badge: "/app-icon/192",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // reuse an open klique window if there is one
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
