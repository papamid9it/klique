import { created, readJson, withApi } from "@/server/http/api";
import { createEmoji, emojiCreateSchema, listEmoji } from "@/server/services/emoji.service";

type P = { slug: string };

/** The community's custom emoji (members). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => listEmoji(viewer, params.slug));

/** Add one (owner, or "Manage emoji"): an uploaded picture and a :name:. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => created(await createEmoji(viewer, params.slug, await readJson(req, emojiCreateSchema))));
