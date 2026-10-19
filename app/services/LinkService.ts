import ApiClient from "@/app/ApiCore";
import type { Envelope, LinkPreviewDTO } from "@/lib/types";

const api = new ApiClient();

export const LinkService = {
  /** OpenGraph preview of a pasted link; `data` is null when there's nothing worth showing. */
  preview: (url: string) => api.get<Envelope<LinkPreviewDTO | null>>("/api/unfurl", { url }),
};
