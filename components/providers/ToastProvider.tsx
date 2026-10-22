"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

type Tone = "default" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const Ctx = createContext<{ toast: (message: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, tone: Tone = "default") => {
      const id = nextId.current++;
      setItems((t) => [...t.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 6500 : 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[450] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex max-w-md animate-pop items-center gap-3 rounded-control border bg-ink px-4 py-3 text-sm font-medium text-canvas shadow-xl",
              t.tone === "error" ? "border-danger" : "border-transparent",
            )}
          >
            <Icon name={t.tone === "error" ? "flag" : "check"} size={16} className="shrink-0" />
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 ml-1 opacity-70 hover:opacity-100">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <Providers>");
  return c.toast;
}
