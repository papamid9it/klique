import { topicDelete, topicGet, topicUpdate } from "@/server/http/topic-routes";

export const GET = topicGet;
export const PATCH = topicUpdate;
export const DELETE = topicDelete;
