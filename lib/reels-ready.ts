import { FeedService } from "@/app/services/FeedService";

const RECHECK_MS = 10 * 60 * 1000;
let ready = false;
let checkedAt = 0;

/** Asks now and then whether there are enough videos for reels. Safe to call often. */
export function checkReels() {
  if (Date.now() - checkedAt < RECHECK_MS) return;
  checkedAt = Date.now();
  void FeedService.reelsReady().then(
    (r) => void (ready = r.data.ready),
    () => void (checkedAt = 0),
  );
}

/** Enough videos to swipe through. Until we know, a post just opens as a post. */
export const reelsReady = () => ready;
