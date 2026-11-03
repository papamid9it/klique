"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export interface ConfirmOptions {
  /** "Delete comment?" */
  title: string;
  /** one line on what happens; default "This can't be undone." */
  body?: string;
  /** the red button; default "Delete" */
  confirmLabel?: string;
  /** false: a normal (not red) button, for things that aren't destructive */
  danger?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Ask>(async () => true);

/**
 * "Are you sure?" before anything destructive: `if (!(await confirm({ title: "Delete comment?" }))) return;`.
 * One in-app dialog for the whole app (a sheet on phones): Cancel has focus, Enter confirms, Esc cancels.
 */
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback<Ask>(
    (o) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAsk(o);
      }),
    [],
  );
  const answer = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsk(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal open={!!ask} onClose={() => answer(false)} title={ask?.title ?? ""} description={ask?.body ?? "This can't be undone."} size="sm">
        <div
          className="flex justify-end gap-2"
          onKeyDown={(e) => {
            // Enter confirms, even with Cancel focused
            if (e.key === "Enter") {
              e.preventDefault();
              answer(true);
            }
          }}
        >
          <Button autoFocus onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button variant={ask?.danger === false ? "primary" : "danger"} onClick={() => answer(true)}>
            {ask?.confirmLabel ?? "Delete"}
          </Button>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}
