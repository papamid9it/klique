"use client";

import { useSyncExternalStore } from "react";
import { dataSaverState, isDataSaver, subscribeDataSaver, type DataSaverPref } from "@/lib/data-saver";

/** For components: re-renders when data saver turns on or off. */
export function useDataSaver(): { on: boolean; pref: DataSaverPref } {
  const on = useSyncExternalStore(subscribeDataSaver, isDataSaver, () => false);
  const pref = useSyncExternalStore(subscribeDataSaver, () => dataSaverState().pref, () => "off" as DataSaverPref);
  return { on, pref };
}
