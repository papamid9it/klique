import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { categoryUsage, getCategories, saveCategories } from "@/server/services/categories.service";
import { categoriesListSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  const [categories, usage] = await Promise.all([getCategories(), categoryUsage()]);
  return { categories, usage };
});

/** Add, rename, reorder, hide or show categories. Nothing is ever deleted. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { categories } = await readJson(req, categoriesListSchema);
  const next = await saveCategories(categories);
  await logAction(viewer, "categories.save", "categories", null, "Categories", next.map((c) => `${c.glyph} ${c.name}${c.hidden ? " (hidden)" : ""}`).join(", "), "/admin/categories");
  return { categories: next, usage: {} };
});
