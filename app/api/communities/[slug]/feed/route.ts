import { feedCreate, feedList } from "@/server/http/feed-routes";

export const GET = feedList;
export const POST = feedCreate;
