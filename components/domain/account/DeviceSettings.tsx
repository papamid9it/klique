"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { NotificationService, type WebPushState } from "@/app/services/NotificationService";
import { useToast } from "@/components/providers/ToastProvider";
import { Switch } from "@/components/ui/Field";

const HINT: Record<WebPushState, string> = {
  on: "You'll get event reminders, new messages and event changes on this device, even when klique isn't open.",
  off: "Get event reminders, new messages and event changes on this device, even when klique isn't open.",
  denied: "Notifications are blocked for klique in this browser. Allow them in the site settings (the icon left of the address bar), then come back.",
  unavailable: "Notifications aren't switched on for this site yet.",
  unsupported: "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.",
};

/** Settings → My Account → This device: notifications in this browser. */
export function DeviceSettings() {
  const toast = useToast();
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    NotificationService.state().then(setState, () => setState("unavailable"));
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      const next = on ? await NotificationService.enable() : await NotificationService.disable();
      setState(next);
      if (on && next === "on") toast("Notifications are on for this device", "success");
      if (on && next === "denied") toast("Notifications are blocked in this browser", "error");
    } catch (e) {
      // the browser's own push service refused (private windows, some Chromium builds, blocked by policy)
      const fromBrowser = e instanceof DOMException || /registration failed|push service/i.test(errorMessage(e));
      toast(fromBrowser ? "This browser couldn't turn on notifications. Try Chrome, Edge, Firefox or Safari, outside a private window." : errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Switch label="Notifications on this device" hint={state ? HINT[state] : "Checking…"} checked={state === "on"} disabled={busy || !state || state === "unsupported" || state === "unavailable" || state === "denied"} onChange={(v) => void toggle(v)} />
  );
}
