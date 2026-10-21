"use client";

import { useSyncExternalStore } from "react";
import { allCategories, DEFAULT_CATEGORIES, onCategoriesChange, visibleCategories, type Category } from "@/lib/constants";

/** The categories on offer (the admin's list, in their order); re-renders when it arrives or changes. */
export function useCategories(): Category[] {
  return useSyncExternalStore(onCategoriesChange, visibleCategories, () => DEFAULT_CATEGORIES);
}

/** Every category, hidden ones too (to show what something already is). */
export function useAllCategories(): Category[] {
  return useSyncExternalStore(onCategoriesChange, allCategories, () => DEFAULT_CATEGORIES);
}
