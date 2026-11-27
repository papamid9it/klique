import { feedLoves, feedVote } from "@/server/http/feed-routes";

export const POST = feedVote;
/** who loved it */
export const GET = feedLoves;
