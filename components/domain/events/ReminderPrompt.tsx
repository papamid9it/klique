"use client";

import { useEffect, useState } from "react";
import { NotificationService, type WebPushState } from "@/app/services/NotificationService";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** After "I'm going": offer a reminder notification on this device if notifications are off here. */
export function ReminderPrompt() {
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    NotificationService.state().then(setState, () => setState(null));
  }, []);

  if (state !== "off") return null;
  return (
    <div className="flex items-start gap-3 rounded-control border border-line bg-raised/60 p-3 text-sm">
      <Icon name="bell" size={16} className="mt-0.5 shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Get a reminder before it starts</p>
        <p className="text-xs text-ink-muted">We&apos;ll notify this device about an hour before.</p>
      </div>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setState(await NotificationService.enable());
          } finally {
            setBusy(false);
          }
        }}
      >
        Turn on
      </Button>
    </div>
  );
}
