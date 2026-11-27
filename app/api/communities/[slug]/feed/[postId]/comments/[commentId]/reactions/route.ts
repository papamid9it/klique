import { feedCommentReact, feedCommentReactors } from "@/server/http/feed-routes";

export const POST = feedCommentReact;
/** who reacted, and with what */
export const GET = feedCommentReactors;
