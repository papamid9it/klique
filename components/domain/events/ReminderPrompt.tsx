"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { InboxService } from "@/app/services/InboxService";
import { NotificationService, type WebPushState } from "@/app/services/NotificationService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

const TEXT: Record<WebPushState, { title: string; body: string }> = {
  on: { title: "Reminder is on", body: "We'll notify this device about an hour before it starts." },
  off: { title: "Get a reminder before it starts", body: "We'll notify this device about an hour before." },
  denied: { title: "Notifications are blocked", body: "Allow them for Klique in this browser's site settings to get a reminder." },
  unsupported: { title: "No reminders in this browser", body: "It can't get notifications. Try another browser or the Klique app." },
  unavailable: { title: "Reminders aren't available yet", body: "They aren't set up here. Please try again later." },
};

/** Going to an event: whether you'll get a reminder on this device, and turning it on if not. It always says where things stand. */
export function ReminderPrompt() {
  const toast = useToast();
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // on means this device can get them and event notifications aren't switched off in Settings
    Promise.all([NotificationService.state(), InboxService.prefs()]).then(
      ([s, prefs]) => setState(s === "on" && !prefs.data.events.push ? "off" : s),
      () => setState(null),
    );
  }, []);

  if (!state) return null;
  const on = state === "on";
  const text = TEXT[state];
  return (
    <div role="status" className={cx("flex items-start gap-3 rounded-control border p-3 text-sm", on ? "border-success/50 bg-success/10" : "border-line bg-raised/60")}>
      <Icon name={on ? "check" : "bell"} size={16} className={cx("mt-0.5 shrink-0", on ? "text-success" : "text-accent-text")} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{text.title}</p>
        <p className="text-xs text-ink-muted">{text.body}</p>
      </div>
      {state === "off" && (
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await NotificationService.enable();
              if (next === "on") await InboxService.updatePrefs({ events: { push: true } });
              setState(next);
              if (next === "on") toast("Reminder is on", "success");
              else if (next === "off") toast("Your browser didn't allow notifications. Tap Turn on to try again.");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Turn on
        </Button>
      )}
    </div>
  );
}
