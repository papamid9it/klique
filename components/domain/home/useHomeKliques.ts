"use client";

import { CrewService } from "@/app/services/CrewService";
import { usePlace } from "@/components/providers/PlaceProvider";
import { useApi, useNow } from "@/lib/hooks/useApi";

/** The kliques Home offers: yours still to come first, then ones you could join (3 at most). */
export function useHomeKliques() {
  const { where, ready } = usePlace();
  const kliques = useApi(() => CrewService.forYou({ limit: 3 }), [], { key: "home-places-kliques" });
  const joinedKliques = useApi(() => CrewService.joined(), [], { key: "home-places-kliques-mine" });
  // few picks for you: fill up with other open kliques nearby you're not in, then offer to start one
  const short = !!kliques.data && kliques.data.items.length < 3;
  const nearby = useApi(short && ready ? () => CrewService.list({ open: true, where, limit: 12 }) : null, [short, ready, where], { key: `home-places-kliques-near:${where}` });
  const picked = kliques.data?.items ?? [];
  // yours first (ones still to come), then ones you could join
  const now = useNow();
  const yours = (joinedKliques.data ?? []).filter((k) => !now || +new Date(k.meetupAt) > +now);
  const others = [...picked, ...(nearby.data?.items ?? []).filter((k) => !k.viewer.standing && !picked.some((p) => p.id === k.id))].filter((k) => !yours.some((y) => y.id === k.id));
  const forYou = [...yours, ...others].slice(0, 3);
  return { forYou, yours };
}

