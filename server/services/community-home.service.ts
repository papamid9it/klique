import "server-only";
import { COMMUNITY_HOME_MIX } from "@/lib/constants";
import type { CommunityHomeDTO, CommunityHomeItem, CrewCardDTO, EventDTO, FeedPostDTO } from "@/lib/types";
import type { IUser } from "../models/User";
import { listKliques } from "./crews.service";
import { discover } from "./discover.service";
import { homeFeed } from "./feed.service";

/** the order inside each block of 10: events spread out, kliques and posts between them */
const PATTERN: ("event" | "klique" | "post")[] = ["event", "event", "klique", "event", "post", "event", "klique", "event", "klique", "post"];

/**
 * Home in the Communities style, page by page: mostly events (the ones Home picks for you: upcoming, ones you can
 * see, mixed by interests, people going and soon), kliques you could join (open, not full, not started, ones you
 * may join), and a few posts from your communities (their usual ranking). Every page is cut from the same full
 * list, so pages never repeat; when one kind runs out the others fill its places. Ads keep their own slots (the
 * apps place them, as on the Casual feed).
 */
export async function communityHome(viewer: IUser, page: number, at?: number, where?: string): Promise<CommunityHomeDTO> {
  // enough of each for this page and the ones before it (never more than a few pages' worth of posts)
  const PAGE = COMMUNITY_HOME_MIX.events + COMMUNITY_HOME_MIX.kliques + COMMUNITY_HOME_MIX.posts;
  const need = page * PAGE;
  const [d, k, postsAt] = await Promise.all([
    discover(viewer, where),
    listKliques(viewer, { open: true, mine: false, page: 1, limit: 30, where } as never, { forYou: true }),
    // posts fill in when events and kliques run out, so enough of them for whole pages (Home's pages are 10 posts)
    postPool(viewer, Math.ceil(need / 10) + 1, at),
  ]);
  const events: EventDTO[] = d.eventsForYou.filter((e) => !e.isPast);
  const kliques: CrewCardDTO[] = k.items.filter((c) => !c.isFull && !c.closed);
  const posts = postsAt.posts;

  const list: CommunityHomeItem[] = [];
  const seen = new Set<string>();
  let e = 0;
  let q = 0;
  let p = 0;
  const take = (kind: "event" | "klique" | "post"): CommunityHomeItem | null => {
    if (kind === "event") while (e < events.length) { const x = events[e++]; if (!seen.has(`e${x.id}`)) return (seen.add(`e${x.id}`), { kind, event: x }); }
    if (kind === "klique") while (q < kliques.length) { const x = kliques[q++]; if (!seen.has(`k${x.id}`)) return (seen.add(`k${x.id}`), { kind, klique: x }); }
    if (kind === "post") while (p < posts.length) { const x = posts[p++]; if (!seen.has(`p${x.id}`)) return (seen.add(`p${x.id}`), { kind, post: x }); }
    return null;
  };
  // fill one slot: its own kind first, then (that kind used up) mostly events, then kliques, then posts
  for (let i = 0; list.length < need + 1; i++) {
    const want = PATTERN[i % PATTERN.length];
    const item = take(want) ?? take("event") ?? take("klique") ?? take("post");
    if (!item) break;
    list.push(item);
  }
  return { items: list.slice((page - 1) * PAGE, page * PAGE), page, hasMore: list.length > page * PAGE, at: postsAt.at };
}

/** Posts from your own communities (not suggestions from elsewhere), in Home's usual order, from its first pages. */
async function postPool(viewer: IUser, pages: number, at?: number): Promise<{ posts: FeedPostDTO[]; hasMore: boolean; at: number }> {
  const posts: FeedPostDTO[] = [];
  let stamp = at;
  let more = false;
  for (let n = 1; n <= Math.min(pages, 8); n++) {
    const r = await homeFeed(viewer, n, stamp);
    stamp = r.at;
    posts.push(...r.items.filter((x) => !x.trending).map((x) => x.post));
    more = r.hasMore;
    if (!r.hasMore) break;
  }
  return { posts, hasMore: more, at: stamp ?? Date.now() };
}
