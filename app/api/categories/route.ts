import { withApi } from "@/server/http/api";
import { getCategories } from "@/server/services/categories.service";

/** The category list (hidden ones flagged), for pickers and labels everywhere. */
export const GET = withApi({ auth: "none", publicCache: 60 }, async () => getCategories());
