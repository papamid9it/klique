import { readJson, withApi } from "@/server/http/api";
import { setTyping, whoIsTyping } from "@/server/services/typing.service";
import { typingSchema, typingTargetSchema } from "@/server/validators/schemas";

/** Who else is typing in a chat (?target=<the chat, as JSON>): for browsers without a live connection. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  let raw: unknown = null;
  try {
    raw = JSON.parse(new URL(req.url).searchParams.get("target") ?? "null");
  } catch {}
  return whoIsTyping(viewer, typingTargetSchema.parse(raw));
});

/** Typing (on) or stopped, in a chat. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { target, on } = await readJson(req, typingSchema);
  return setTyping(viewer, target, on);
});
