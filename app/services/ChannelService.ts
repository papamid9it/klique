import ApiClient from "@/app/ApiCore";
import type { PollInput } from "./PollService";
import type { ReactionKind } from "@/lib/reactions";
import type {
  ReactionDTO,
  ChannelCategoryDTO,
  ChannelDTO,
  ChannelMessageDTO,
  ChannelType,
  ChannelVisibility,
  ChannelsDTO,
  ChatPage,
  Envelope,
  VoiceJoinDTO,
  StaffDTO,
  UserBrief,
} from "@/lib/types";

const api = new ApiClient();

/** A community, or one of its groups. Omit `sub` for the community itself. */
export interface SpaceRef {
  slug: string;
  sub?: string | null;
}

const base = (s: SpaceRef) => (s.sub ? `/api/communities/${s.slug}/groups/${s.sub}` : `/api/communities/${s.slug}`);

/** What you can send: text, a sticker, up to 4 uploaded pictures, and the message you are answering. */
export interface SendInput {
  body: string;
  sticker?: string;
  /** a saved picture sticker */
  stickerUrl?: string;
  images?: string[];
  replyToId?: string;
  /** start a poll (the message carries only the poll) */
  poll?: PollInput;
}

export interface ChannelInput {
  name: string;
  topic?: string;
  type?: ChannelType;
  visibility?: ChannelVisibility;
  categoryId?: string | null;
  /** slow mode in seconds (0 = off) */
  slowModeSec?: number;
  /** guest list for a private channel (create only) */
  memberIds?: string[];
}

/** Chat for communities and groups: channels, categories, guest lists and messages. Same service for web, mobile and desktop. */
export const ChannelService = {
  list: (s: SpaceRef) => api.get<Envelope<ChannelsDTO>>(`${base(s)}/channels`),
  create: (s: SpaceRef, input: ChannelInput) => api.post<Envelope<ChannelDTO>>(`${base(s)}/channels`, input),
  update: (s: SpaceRef, channelSlug: string, patch: Partial<Omit<ChannelInput, "memberIds">>) => api.patch<Envelope<ChannelDTO>>(`${base(s)}/channels/${channelSlug}`, patch),
  editMessage: (s: SpaceRef, channelSlug: string, messageId: string, body: string) => api.patch<Envelope<ChannelMessageDTO>>(`${base(s)}/channels/${channelSlug}/messages/${messageId}`, { body }),
  remove: (s: SpaceRef, channelSlug: string) => api.delete<Envelope<{ deleted: boolean }>>(`${base(s)}/channels/${channelSlug}`),

  /** categories exist on communities only */
  createCategory: (slug: string, name: string) => api.post<Envelope<ChannelCategoryDTO>>(`/api/communities/${slug}/categories`, { name }),
  renameCategory: (slug: string, categoryId: string, name: string) => api.patch<Envelope<ChannelCategoryDTO>>(`/api/communities/${slug}/categories/${categoryId}`, { name }),
  removeCategory: (slug: string, categoryId: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/communities/${slug}/categories/${categoryId}`),

  /** Newest page (no cursor), older page (`before` = oldest id on screen) or new messages (`after` = newest id). */
  messages: (s: SpaceRef, channelSlug: string, cursor: { before?: string; after?: string } = {}) => api.get<Envelope<ChatPage>>(`${base(s)}/channels/${channelSlug}/messages`, { ...cursor }),
  send: (s: SpaceRef, channelSlug: string, input: SendInput) => api.post<Envelope<ChannelMessageDTO>>(`${base(s)}/channels/${channelSlug}/messages`, input),
  /** Toggle a reaction (like, love, laugh…) on a message. Returns that message's fresh counts. */
  react: (s: SpaceRef, channelSlug: string, messageId: string, kind: ReactionKind) => api.post<Envelope<ReactionDTO[]>>(`${base(s)}/channels/${channelSlug}/messages/${messageId}/reactions`, { kind }),
  /** Fresh reaction counts for messages already on screen, keyed by message id. */
  reactions: (s: SpaceRef, channelSlug: string, ids: string[]) => api.get<Envelope<Record<string, ReactionDTO[]>>>(`${base(s)}/channels/${channelSlug}/reactions`, { ids: ids.join(",") }),
  deleteMessage: (s: SpaceRef, channelSlug: string, messageId: string) => api.delete<Envelope<{ deleted: boolean }>>(`${base(s)}/channels/${channelSlug}/messages/${messageId}`),
  /** Owners and admins pin a message to the channel, or unpin it. */
  pin: (s: SpaceRef, channelSlug: string, messageId: string, pinned: boolean) => api.post<Envelope<ChannelMessageDTO>>(`${base(s)}/channels/${channelSlug}/messages/${messageId}/pin`, { pinned }),
  pins: (s: SpaceRef, channelSlug: string) => api.get<Envelope<ChannelMessageDTO[]>>(`${base(s)}/channels/${channelSlug}/pins`),
  /** Permission to join a voice channel (a short-lived LiveKit token). Audio itself runs on LiveKit, not on our server. */
  joinVoice: (s: SpaceRef, channelSlug: string) => api.post<Envelope<VoiceJoinDTO>>(`${base(s)}/channels/${channelSlug}/voice`),
  markRead: (s: SpaceRef, channelSlug: string) => api.post<Envelope<{ read: boolean }>>(`${base(s)}/channels/${channelSlug}/read`),

  /** private channels (owners/admins) */
  guests: (s: SpaceRef, channelSlug: string) => api.get<Envelope<UserBrief[]>>(`${base(s)}/channels/${channelSlug}/members`),
  addGuest: (s: SpaceRef, channelSlug: string, userId: string) => api.post<Envelope<{ added: boolean }>>(`${base(s)}/channels/${channelSlug}/members`, { userId }),
  removeGuest: (s: SpaceRef, channelSlug: string, userId: string) => api.delete<Envelope<{ removed: boolean }>>(`${base(s)}/channels/${channelSlug}/members/${userId}`),

  /** people in this space whose handle or name starts with `q` (for the guest picker) */
  searchMembers: (s: SpaceRef, q: string) => api.get<Envelope<UserBrief[]>>(`${base(s)}/member-search`, { q }),
  /** people who can be @tagged in this channel */
  mentionable: (s: SpaceRef, channelSlug: string, q: string) => api.get<Envelope<UserBrief[]>>(`${base(s)}/channels/${channelSlug}/mentionable`, { q }),

  staff: (s: SpaceRef) => api.get<Envelope<StaffDTO[]>>(`${base(s)}/staff`),
};
