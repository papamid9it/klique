import type { ReactionDTO } from "@/lib/types";

type Queue = { tail: Promise<void>; pending: number; confirmed: ReactionDTO[] };
const queues = new Map<string, Queue>();

/**
 * Reactions feel instant: the caller has already shown the change (applyReaction). This sends it in the background,
 * one request at a time per message so fast taps never cross, and only when nothing more is waiting hands over the
 * server's answer (`done`) — or, if that last one failed, the last state the server confirmed, to roll back to
 * (`failed`). The returned promise gives the error when this tap was the one that failed at the end, else null.
 */
export function sendReaction(key: string, before: ReactionDTO[], send: () => Promise<ReactionDTO[]>, done: (server: ReactionDTO[]) => void, failed: (rollback: ReactionDTO[]) => void): Promise<unknown> {
  const q = queues.get(key) ?? { tail: Promise.resolve(), pending: 0, confirmed: before };
  if (!q.pending) q.confirmed = before;
  q.pending++;
  queues.set(key, q);
  return new Promise((resolve) => {
    q.tail = q.tail.then(async () => {
      try {
        q.confirmed = await send();
        if (--q.pending === 0) {
          queues.delete(key);
          done(q.confirmed);
        }
        resolve(null);
      } catch (e) {
        const last = --q.pending === 0;
        if (last) {
          queues.delete(key);
          failed(q.confirmed);
        }
        resolve(last ? e : null);
      }
    });
  });
}

/** A request for this message is still on its way (a background refresh shouldn't overwrite what's on screen). */
export const reactionPending = (key: string) => (queues.get(key)?.pending ?? 0) > 0;
