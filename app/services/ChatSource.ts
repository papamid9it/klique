import type { ReactionKind } from "@/lib/reactions";
import type { ChannelMessageDTO, ChatPage, Envelope, RealtimeEvent, ReactionDTO, UserBrief } from "@/lib/types";
import { ChannelService, type SendInput, type SpaceRef } from "./ChannelService";
import { CrewService } from "./CrewService";

/**
 * Where a chat's messages come from. The chat screen (ChatPane) and its state (useChat) work with any source,
 * so a community channel and a crew's chat look and behave the same: pictures, stickers, replies, reactions,
 * @mentions, edit and delete. Pins are optional (crews have none).
 */
export interface ChatSource {
  /** stable id for caching what was last on screen */
  key: string;
  messages(cursor?: { before?: string; after?: string }): Promise<Envelope<ChatPage>>;
  send(input: SendInput): Promise<Envelope<ChannelMessageDTO>>;
  edit(messageId: string, body: string): Promise<Envelope<ChannelMessageDTO>>;
  remove(messageId: string): Promise<Envelope<{ deleted: boolean }>>;
  react(messageId: string, kind: ReactionKind): Promise<Envelope<ReactionDTO[]>>;
  reactions(ids: string[]): Promise<Envelope<Record<string, ReactionDTO[]>>>;
  markRead(): Promise<unknown>;
  mentionable(q: string): Promise<Envelope<UserBrief[]>>;
  pin?(messageId: string, pinned: boolean): Promise<Envelope<ChannelMessageDTO>>;
  pins?(): Promise<Envelope<ChannelMessageDTO[]>>;
  /** this live ping means something changed in this chat */
  isLive(e: RealtimeEvent): boolean;
}

export function channelSource(space: SpaceRef, channelSlug: string, channelId?: string): ChatSource {
  return {
    key: `chat:${space.slug}:${space.sub ?? ""}:${channelSlug}`,
    messages: (cursor) => ChannelService.messages(space, channelSlug, cursor),
    send: (input) => ChannelService.send(space, channelSlug, input),
    edit: (id, body) => ChannelService.editMessage(space, channelSlug, id, body),
    remove: (id) => ChannelService.deleteMessage(space, channelSlug, id),
    react: (id, kind) => ChannelService.react(space, channelSlug, id, kind),
    reactions: (ids) => ChannelService.reactions(space, channelSlug, ids),
    markRead: () => ChannelService.markRead(space, channelSlug),
    mentionable: (q) => ChannelService.mentionable(space, channelSlug, q),
    pin: (id, pinned) => ChannelService.pin(space, channelSlug, id, pinned),
    pins: () => ChannelService.pins(space, channelSlug),
    isLive: (e) => e.type === "channel" && (!channelId || e.channelId === channelId),
  };
}

export function crewSource(crewId: string): ChatSource {
  return {
    key: `crew-chat:${crewId}`,
    messages: (cursor) => CrewService.messages(crewId, cursor),
    send: (input) => CrewService.send(crewId, input),
    edit: (id, body) => CrewService.editMessage(crewId, id, body),
    remove: (id) => CrewService.deleteMessage(crewId, id),
    react: (id, kind) => CrewService.react(crewId, id, kind),
    reactions: (ids) => CrewService.reactions(crewId, ids),
    markRead: () => CrewService.markRead(crewId),
    mentionable: (q) => CrewService.mentionable(crewId, q),
    isLive: (e) => e.type === "crew" && e.crewId === crewId && !!e.chat,
  };
}
