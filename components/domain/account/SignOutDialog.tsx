"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type Ask = { everywhere: boolean };
let show: ((a: Ask) => void) | null = null;

/** "Sign out?" from anywhere: the account menu, the Me sheet, Settings. */
export const askSignOut = (everywhere = false) => show?.({ everywhere });

export function SignOutHost() {
  const { signOut } = useAuth();
  const toast = useToast();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    show = setAsk;
    return () => {
      show = null;
    };
  }, []);
  async function go() {
    setBusy(true);
    try {
      if (ask?.everywhere) await AuthService.logoutEverywhere();
      setAsk(null);
      // signed out here whatever happens; after "everywhere" this session is already gone, so the call can fail
      await signOut().catch(() => {});
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!ask}
      onClose={() => setAsk(null)}
      size="sm"
      icon={{ name: "logout", danger: true }}
      title={ask?.everywhere ? "Sign out everywhere?" : "Sign out of Klique?"}
      description={ask?.everywhere ? "This ends every session, on all your phones and computers. You'll need to sign in again on each." : "You can sign back in any time."}
    >
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button size="lg" onClick={() => setAsk(null)} disabled={busy} className="h-14 border-2 border-ink text-[16px]">
          Cancel
        </Button>
        <Button size="lg" variant="danger" onClick={() => void go()} loading={busy} className="h-14 border-2 border-[#8a1f16] !bg-[#a3261b] text-[16px] !text-white hover:!bg-[#8a1f16]">
          Sign out
        </Button>
      </div>
    </Modal>
  );
}
