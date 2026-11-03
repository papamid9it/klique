import { withApi } from "@/server/http/api";
import { deleteEmoji } from "@/server/services/emoji.service";

export const DELETE = withApi<{ slug: string; id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => deleteEmoji(viewer, params.slug, params.id));
