import type { IUser } from "../models/User";
import type { SidebarDTO } from "@/lib/types";
import { listBoards } from "./boards.service";
import { listChannels } from "./channels.service";
import { getCommunity } from "./communities.service";
import { resolveSpaceFor } from "./spaces.service";

/** most communities one call answers for (the client asks in batches) */
export const SIDEBARS_MAX = 20;

/**
 * Everything the left side of several communities needs (header, channel list, boards) in one round trip,
 * the way Discord's start-up payload carries every server's channels. The client preloads the communities
 * you're in with it, so opening one paints at once. Each community goes through the same access checks as
 * its own endpoints; one that fails (gone, banned, hidden) comes back as null instead of failing the rest.
 */
export async function communitySidebars(viewer: IUser, slugs: string[]): Promise<Record<string, SidebarDTO | null>> {
  const unique = [...new Set(slugs)].slice(0, SIDEBARS_MAX);
  const out: Record<string, SidebarDTO | null> = {};
  // a few at a time so one big request doesn't hog the database pool
  const queue = [...unique];
  const worker = async () => {
    for (let slug = queue.shift(); slug !== undefined; slug = queue.shift()) {
      try {
        const community = await getCommunity(viewer, slug);
        if (community.locked) {
          out[slug] = { community, channels: null, boards: null };
          continue;
        }
        const { space, access } = await resolveSpaceFor(viewer, slug);
        const [channels, boards] = await Promise.all([listChannels(viewer, space, access), listBoards(viewer, space, access)]);
        out[slug] = { community, channels, boards };
      } catch {
        out[slug] = null;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}
