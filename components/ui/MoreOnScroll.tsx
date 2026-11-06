"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { useLoadOnScroll } from "@/lib/hooks/useLoadOnScroll";

/** The end of a long list: more loads as it scrolls into view. If a load brings nothing (no signal), it waits for a tap. */
export function MoreOnScroll({ hasMore, loading, count, onLoad, className = "" }: { hasMore: boolean; loading: boolean; count: number; onLoad: () => unknown; className?: string }) {
  const [stuck, setStuck] = useState(false);
  const [asking, setAsking] = useState(false);
  const asked = useRef({ count: 0, started: false });
  const go = () => {
    asked.current = { count, started: false };
    setAsking(true);
    setStuck(false);
    void Promise.resolve(onLoad()).catch(() => {});
  };
  useEffect(() => {
    if (!asking) return;
    if (loading) asked.current.started = true;
    else if (asked.current.started) {
      setAsking(false);
      setStuck(asked.current.count === count);
    }
  }, [asking, loading, count]);
  const end = useLoadOnScroll<HTMLDivElement>(go, hasMore && !loading && !stuck && !asking);
  if (!hasMore) return null;
  return (
    <div ref={end} className={`flex min-h-12 items-center justify-center py-3 text-ink-muted ${className}`}>
      {stuck ? <Button onClick={go}>Load more</Button> : <Spinner />}
    </div>
  );
}
