import { topicLike, topicLikers } from "@/server/http/topic-routes";

export const POST = topicLike;
/** who liked it (?comment=<id>: one of its comments) */
export const GET = topicLikers;
