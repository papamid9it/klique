import ApiClient from "@/app/ApiCore";
import type { Category } from "@/lib/constants";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();

type Usage = Record<string, { communities: number; events: number; people: number }>;

export const CategoryService = {
  list: () => api.get<Envelope<Category[]>>("/api/categories"),
  adminList: () => api.get<Envelope<{ categories: Category[]; usage: Usage }>>("/api/admin/categories"),
  save: (categories: Category[]) => api.put<Envelope<{ categories: Category[]; usage: Usage }>>("/api/admin/categories", { categories }),
};
