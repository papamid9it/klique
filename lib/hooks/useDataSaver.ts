"use client";

import { useSyncExternalStore } from "react";
import { dataSaverState, isDataSaver, subscribeDataSaver, type DataSaverPref } from "@/lib/data-saver";

/** For components: re-renders when data saver turns on or off (or the connection changes while on "auto"). */
export function useDataSaver(): { on: boolean; pref: DataSaverPref; slow: boolean } {
  const on = useSyncExternalStore(subscribeDataSaver, isDataSaver, () => false);
  const pref = useSyncExternalStore(subscribeDataSaver, () => dataSaverState().pref, () => "auto" as DataSaverPref);
  const slow = useSyncExternalStore(subscribeDataSaver, () => dataSaverState().slow, () => false);
  return { on, pref, slow };
}
