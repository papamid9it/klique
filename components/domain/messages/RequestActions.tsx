"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { MessageService } from "@/app/services/MessageService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";

/** Accept, Delete or Block a message request (Delete and Block are quiet: the sender isn't told). */
export function RequestActions({ id, name, onDone, compact }: { id: string; name: string; onDone: (action: "accept" | "delete" | "block") => void; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(action: "accept" | "delete" | "block") {
    if (action === "block" && !window.confirm(`Block ${name}? They won't be able to message you, and this request is deleted.`)) return;
    setBusy(action);
    try {
      await MessageService.answerRequest(id, action);
      toast(action === "accept" ? `You can chat with ${name} now` : action === "block" ? `${name} is blocked` : "Request deleted", "success");
      onDone(action);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="primary" loading={busy === "accept"} disabled={!!busy} onClick={() => void act("accept")}>
        Accept
      </Button>
      <Button size="sm" loading={busy === "delete"} disabled={!!busy} onClick={() => void act("delete")}>
        Delete
      </Button>
      <Button size="sm" variant="ghost" loading={busy === "block"} disabled={!!busy} onClick={() => void act("block")}>
        {compact ? "Block" : `Block ${name}`}
      </Button>
    </div>
  );
}

/** Opens the inbox after the request is gone (deleted or blocked), or stays (accepted). */
export function useAfterRequest(id: string) {
  const router = useRouter();
  return (action: "accept" | "delete" | "block") => {
    if (action !== "accept") router.replace("/messages/requests");
    else router.replace(`/messages/${id}`);
  };
}
