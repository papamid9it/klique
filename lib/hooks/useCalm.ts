"use client";

import { useSyncExternalStore } from "react";
import { isReducedMotion, motionState, subscribeMotion, type MotionPref } from "@/lib/motion";
import { useDataSaver } from "./useDataSaver";

/** The Animations setting (lib/motion): `reduce` is true when motion should stop. */
export function useMotion(): { reduce: boolean; pref: MotionPref; deviceReduce: boolean } {
  const reduce = useSyncExternalStore(subscribeMotion, isReducedMotion, () => false);
  const pref = useSyncExternalStore(subscribeMotion, () => motionState().pref, () => "device" as MotionPref);
  const deviceReduce = useSyncExternalStore(subscribeMotion, () => motionState().deviceReduce, () => false);
  return { reduce, pref, deviceReduce };
}

/**
 * Keep heavy decoration still (profile effects, GIF pictures show their first frame): animations are off, or data
 * saver is on. Small CSS motion (name effects, frames) only follows the Animations setting.
 */
export function useCalm(): boolean {
  const saver = useDataSaver().on;
  const { reduce } = useMotion();
  return saver || reduce;
}
