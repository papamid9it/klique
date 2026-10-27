import { feedDelete, feedEdit, feedGet } from "@/server/http/feed-routes";

export const GET = feedGet;
export const PATCH = feedEdit;
export const DELETE = feedDelete;
