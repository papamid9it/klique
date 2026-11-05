import ApiClient from "@/app/ApiCore";
import type { DiscoverDTO, Envelope, SearchFilters, SearchResultsDTO } from "@/lib/types";

const api = new ApiClient();

export const DiscoverService = {
  discover: (where?: string) => api.get<Envelope<DiscoverDTO>>("/api/discover", { where }, { ttl: 30 }),
  search: (q: string, filters: SearchFilters = {}) => api.get<Envelope<SearchResultsDTO>>("/api/search", { q, ...filters, past: filters.past ? "1" : undefined, verified: filters.verified ? "1" : undefined }),
};
