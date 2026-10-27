import ApiClient from "@/app/ApiCore";
import type { BoardSidebarDTO, BoardDTO, Envelope, Paginated, TopicCommentDTO, TopicDTO, TopicDetailDTO, TopicMediaDTO, TopicSort } from "@/lib/types";

const api = new ApiClient();
const base = (slug: string) => `/api/communities/${slug}/topics`;

export interface TopicInput {
  /** board slug; the first board when left out */
  board?: string;
  title: string;
  body?: string;
  /** at most one picture */
  media?: TopicMediaDTO[];
  tags?: string[];
}

/** A community's boards: posts (Discord forum style) with upvotes, tags, follows and a chat of replies. Same service for web, mobile and desktop. */
export const TopicService = {
  list: (slug: string, params: { board?: string; sort?: TopicSort; q?: string; tag?: string; page?: number } = {}) => api.get<Envelope<Paginated<TopicDTO>>>(base(slug), { ...params }),
  boards: (slug: string) => api.get<Envelope<BoardDTO[]>>(`/api/communities/${slug}/boards`, undefined, { ttl: 30 }),
  createBoard: (slug: string, input: { name: string; description?: string; postPolicy?: "members" | "admins" }) => api.post<Envelope<BoardDTO>>(`/api/communities/${slug}/boards`, input),
  updateBoard: (slug: string, boardId: string, patch: { name?: string; description?: string; rules?: string; postPolicy?: "members" | "admins" }) => api.patch<Envelope<BoardDTO>>(`/api/communities/${slug}/boards/${boardId}`, patch),
  /** trending topics and top contributors this week, for the sidebar beside a board */
  boardSidebar: (slug: string, boardId: string) => api.get<Envelope<BoardSidebarDTO>>(`/api/communities/${slug}/boards/${boardId}/sidebar`),
  removeBoard: (slug: string, boardId: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}/boards/${boardId}`),
  get: (slug: string, topicId: string) => api.get<Envelope<TopicDetailDTO>>(`${base(slug)}/${topicId}`),
  create: (slug: string, input: TopicInput) => api.post<Envelope<TopicDTO>>(base(slug), input),
  /** content edits (author) and pin / lock (owners and admins) */
  update: (slug: string, topicId: string, patch: Partial<TopicInput> & { pinned?: boolean; locked?: boolean }) => api.patch<Envelope<TopicDTO>>(`${base(slug)}/${topicId}`, patch),
  remove: (slug: string, topicId: string) => api.delete<Envelope<{ deleted: boolean }>>(`${base(slug)}/${topicId}`),
  like: (slug: string, topicId: string) => api.post<Envelope<{ liked: boolean; likeCount: number }>>(`${base(slug)}/${topicId}/like`),
  /** hear about new replies in a post's chat */
  follow: (slug: string, topicId: string, on: boolean) => (on ? api.post<Envelope<{ following: boolean }>>(`${base(slug)}/${topicId}/follow`) : api.delete<Envelope<{ following: boolean }>>(`${base(slug)}/${topicId}/follow`)),

  comment: (slug: string, topicId: string, body: string, parentId?: string) => api.post<Envelope<TopicCommentDTO>>(`${base(slug)}/${topicId}/comments`, { body, parentId }),
  editComment: (slug: string, topicId: string, commentId: string, body: string) => api.patch<Envelope<TopicCommentDTO>>(`${base(slug)}/${topicId}/comments/${commentId}`, { body }),
  removeComment: (slug: string, topicId: string, commentId: string) => api.delete<Envelope<{ deleted: boolean }>>(`${base(slug)}/${topicId}/comments/${commentId}`),
  likeComment: (slug: string, topicId: string, commentId: string) => api.post<Envelope<{ liked: boolean; likeCount: number }>>(`${base(slug)}/${topicId}/comments/${commentId}/like`),

  /** topics from the communities you've joined (home feed) */
  feed: () => api.get<Envelope<TopicDTO[]>>("/api/me/topics", undefined, { ttl: 20 }),
  /** the most commented topics (30+ comments); an empty list means the home page shows no trending section */
  trending: () => api.get<Envelope<TopicDTO[]>>("/api/topics/trending", undefined, { ttl: 60 }),
};
