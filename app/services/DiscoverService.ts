import ApiClient from "@/app/ApiCore";
import type { DiscoverDTO, Envelope, SearchResultsDTO } from "@/lib/types";

const api = new ApiClient();

export const DiscoverService = {
  discover: (where?: string) => api.get<Envelope<DiscoverDTO>>("/api/discover", { where }, { ttl: 30 }),
  search: (q: string, where?: string) => api.get<Envelope<SearchResultsDTO>>("/api/search", { q, where }),
};
