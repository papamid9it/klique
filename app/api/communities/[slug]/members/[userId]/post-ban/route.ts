import { memberPostBan } from "@/server/http/space-routes";

/** Stop a member writing in Posts and on Boards (seconds: how long, null: until it's lifted, 0: lift it). They can still chat. */
export const POST = memberPostBan;
