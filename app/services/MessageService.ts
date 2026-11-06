import ApiClient from "@/app/ApiCore";
import type { PollInput } from "./PollService";
import type { ReactionKind } from "@/lib/reactions";
import type { ChatGroupDTO, ConversationDetailDTO, ConversationDTO, Envelope, MessageDTO, ReactionDTO } from "@/lib/types";

const api = new ApiClient();

export const MessageService = {
  inbox: () => api.get<Envelope<ConversationDTO[]>>("/api/conversations"),
  /** group chats between friends */
  createGroup: (name: string, memberIds: string[]) => api.post<Envelope<ConversationDetailDTO>>("/api/conversations/groups", { name, memberIds }),
  group: (id: string) => api.get<Envelope<ChatGroupDTO>>(`/api/conversations/${id}/group`),
  renameGroup: (id: string, name: string) => api.patch<Envelope<ChatGroupDTO>>(`/api/conversations/${id}/group`, { name }),
  addToGroup: (id: string, memberIds: string[]) => api.post<Envelope<ChatGroupDTO>>(`/api/conversations/${id}/group/members`, { memberIds }),
  removeFromGroup: (id: string, userId: string) => api.delete<Envelope<{ left: boolean }>>(`/api/conversations/${id}/group/members/${userId}`),
  /** Opens (or creates) the one-to-one conversation with `handle`. Fails clearly if they can't be messaged. */
  start: (handle: string, message?: string) => api.post<Envelope<ConversationDetailDTO>>("/api/conversations", { handle, message }),
  open: (id: string, before?: string) => api.get<Envelope<ConversationDetailDTO>>(`/api/conversations/${id}`, { before }),
  send: (id: string, input: { body: string; sticker?: string; stickerUrl?: string; images?: string[]; replyToId?: string; poll?: PollInput }) => api.post<Envelope<MessageDTO>>(`/api/conversations/${id}/messages`, input),
  edit: (id: string, messageId: string, body: string) => api.patch<Envelope<MessageDTO>>(`/api/conversations/${id}/messages/${messageId}`, { body }),
  remove: (id: string, messageId: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/conversations/${id}/messages/${messageId}`),
  react: (id: string, messageId: string, kind: ReactionKind) => api.post<Envelope<ReactionDTO[]>>(`/api/conversations/${id}/messages/${messageId}/reactions`, { kind }),
  markRead: (id: string) => api.post<Envelope<{ read: boolean }>>(`/api/conversations/${id}/read`),
  /** message requests sent to you */
  requests: () => api.get<Envelope<ConversationDTO[]>>("/api/conversations/requests"),
  /** accept, delete (silently) or block a message request */
  answerRequest: (id: string, action: "accept" | "delete" | "block") => api.post<Envelope<{ accepted?: boolean; deleted?: boolean }>>(`/api/conversations/${id}/request`, { action }),
};
