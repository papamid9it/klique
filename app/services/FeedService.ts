import ApiClient from "@/app/ApiCore";
import type { ReactionKind } from "@/lib/reactions";
import type { Envelope, FeedCommentDTO, FeedPostDTO, FeedSidebarDTO, HomeFeedItem, Paginated, ReactionDTO, TopicMediaDTO } from "@/lib/types";

const api = new ApiClient();
const base = (slug: string) => `/api/communities/${slug}/feed`;

/** A community's Posts section (pictures and videos, votes, nested comments) and the home feed. Same service for web, mobile and desktop. */
export const FeedService = {
  list: (slug: string, page = 1, at?: number) => api.get<Envelope<Paginated<FeedPostDTO> & { at: number }>>(base(slug), at ? { page, at } : { page }),
  sidebar: (slug: string) => api.get<Envelope<FeedSidebarDTO>>(`${base(slug)}/sidebar`),
  /** pictures or a video (caption optional), or text: a title (needed past lib/feedText TEXT_CARD_MAX) and a card colour */
  create: (slug: string, input: { caption: string; title?: string; textBg?: string; explicit?: boolean; media: TopicMediaDTO[] }) => api.post<Envelope<FeedPostDTO>>(base(slug), input),
  get: (slug: string, postId: string) => api.get<Envelope<FeedPostDTO>>(`${base(slug)}/${postId}`),
  editCaption: (slug: string, postId: string, caption: string) => api.patch<Envelope<FeedPostDTO>>(`${base(slug)}/${postId}`, { caption }),
  /** mark a post explicit or not (its poster, or the community's owner and admins; explicit communities only) */
  setExplicit: (slug: string, postId: string, explicit: boolean) => api.patch<Envelope<FeedPostDTO>>(`${base(slug)}/${postId}`, { explicit }),
  remove: (slug: string, postId: string) => api.delete<Envelope<{ deleted: boolean }>>(`${base(slug)}/${postId}`),
  /** 1 up, -1 down, 0 take it back */
  vote: (slug: string, postId: string, value: 1 | -1 | 0) => api.post<Envelope<Pick<FeedPostDTO, "upCount" | "downCount" | "myVote">>>(`${base(slug)}/${postId}/vote`, { value }),
  /** a post by its own link (/p/[id]), wherever it lives */
  byId: (id: string) => api.get<Envelope<FeedPostDTO>>(`/api/posts/${id}`),
  comments: (slug: string, postId: string) => api.get<Envelope<FeedCommentDTO[]>>(`${base(slug)}/${postId}/comments`),
  /** text, a sticker (built-in or saved), or both */
  comment: (slug: string, postId: string, input: { body: string; sticker?: string; stickerUrl?: string; parentId?: string }) => api.post<Envelope<FeedCommentDTO>>(`${base(slug)}/${postId}/comments`, input),
  /** change your own comment's text */
  editComment: (slug: string, postId: string, commentId: string, body: string) => api.patch<Envelope<FeedCommentDTO>>(`${base(slug)}/${postId}/comments/${commentId}`, { body }),
  removeComment: (slug: string, postId: string, commentId: string) => api.delete<Envelope<{ deleted: boolean }>>(`${base(slug)}/${postId}/comments/${commentId}`),
  react: (slug: string, postId: string, commentId: string, kind: ReactionKind) => api.post<Envelope<ReactionDTO[]>>(`${base(slug)}/${postId}/comments/${commentId}/reactions`, { kind }),
  /** posts from your communities, best first, with a trending one from elsewhere now and then */
  home: (page = 1, at?: number) => api.get<Envelope<{ items: HomeFeedItem[]; page: number; hasMore: boolean; at: number }>>("/api/me/feed", at ? { page, at } : { page }),
};
