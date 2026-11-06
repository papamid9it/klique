"use client";

import { useEffect, useState } from "react";

/** A list shown a little at a time: `step` to start, `step` more per "See more", fetching ahead from the server as needed. */
export function useSteps(total: number, hasMore: boolean, loading: boolean, loadMore: () => unknown, reset: unknown, step = 10) {
  const [shown, setShown] = useState(step);
  useEffect(() => setShown(step), [reset, step]);
  return {
    shown,
    canMore: total > shown || hasMore,
    /** nothing left on hand to show: the button waits for the server */
    waiting: loading && total <= shown,
    more: () => {
      const next = shown + step;
      setShown(next);
      if (hasMore && !loading && total < next + step) void loadMore();
    },
  };
}
