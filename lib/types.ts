/**
 * API contract shared by the backend (server/serializers) and every client
 * (this web app today; mobile / desktop later). Pure types — no runtime code.
 */
import type { CityId, DmPolicy, InterestId, ProfileVisibility, ReportReason } from "./constants";
import type { MoodId } from "./moods";

export type Id = string;
export type ISODate = string;

export interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
  /** field-level validation errors, when success=false and status=422 */
  errors?: Record<string, string>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

/* ------------------------------ people ------------------------------ */

export interface UserBrief {
  id: Id;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** animated ring around the picture (lib/cosmetics FrameId), if chosen */
  avatarFrame?: string | null;
  /** animated name style (lib/cosmetics NameEffectId), if chosen */
  nameEffect?: string | null;
  /** ISO country code, e.g. "NG" */
  country: string;
  city: CityId;
}

export interface UserPrivacy {
  profileVisibility: ProfileVisibility;
  attendancePublic: boolean;
}

export interface UserProfile extends UserBrief {
  bio: string;
  bannerUrl?: string | null;
  bannerColor?: string | null;
  /** state / region slug ("" when the country has none) */
  region: string;
  neighborhood: string;
  interests: InterestId[];
  joinedAt: ISODate;
}

/** The signed-in user's own account. */
export interface UserMe extends UserProfile {
  email: string;
  emailVerified: boolean;
  /** false for Google-only accounts: they can add a password without entering a current one */
  hasPassword: boolean;
  googleLinked: boolean;
  mood: MoodId;
  privacy: UserPrivacy;
  dmPolicy: DmPolicy;
  unreadMessages: number;
  /** a site admin (opens /admin) */
  isAdmin: boolean;
}

/** What a viewer is allowed to know about a profile. */
export interface ProfileView {
  profile: UserProfile;
  isSelf: boolean;
  /** false when privacy hides the profile body; `profile` then only has brief fields */
  visible: boolean;
  hiddenReason?: "private" | "members";
  communities: CommunityCardDTO[];
  hostedEvents: EventDTO[];
  /** upcoming RSVPs — empty unless attendance is public or isSelf */
  upcomingEvents: EventDTO[];
  attendanceHidden: boolean;
  stats: { communities: number; hosted: number; going: number };
  messaging: MessagingEligibility;
  blockedByMe: boolean;
  /** the viewer's friend status with this person ("none" for yourself / signed out) */
  friendship: FriendStatusDTO;
  /** people who are friends with both the viewer and this person (empty for yourself / signed out) */
  mutualFriends: UserBrief[];
}

export type FriendState = "none" | "friends" | "incoming" | "outgoing";

/** Where the viewer stands with one person; `requestId` is set unless "none". */
export interface FriendStatusDTO {
  state: FriendState;
  requestId?: Id;
  /** when the friendship began (state "friends" only) */
  since?: string;
}

export interface FriendDTO {
  user: UserBrief;
  since: ISODate;
}

export interface FriendRequestDTO {
  id: Id;
  user: UserBrief;
  direction: "incoming" | "outgoing";
  createdAt: ISODate;
}

export interface FriendSuggestionDTO {
  user: UserBrief;
  mutualCommunities: number;
}

export interface FriendsSummaryDTO {
  friends: number;
  /** requests waiting for the viewer to answer */
  incoming: number;
}

export interface MessagingEligibility {
  allowed: boolean;
  reason?: "self" | "blocked" | "unavailable" | "policy_nobody" | "policy_shared" | "signed_out";
  message?: string;
}

/* ---------------------------- communities --------------------------- */

export type Role = "owner" | "admin" | "member";
export type CommunityPrivacy = "public" | "private";
export type SubVisibility = "parent" | "private";

export interface ViewerAccess {
  role: Role | null;
  isMember: boolean;
  pendingRequest: boolean;
  /** owner/admin of this space (manage members, requests, invites, settings) */
  canManage: boolean;
  /** may read posts/events/members */
  canView: boolean;
  /** may create posts / events here */
  canPost: boolean;
}

export interface CommunityCardDTO {
  id: Id;
  slug: string;
  name: string;
  /** short preview. For a locked private community this is empty. */
  description: string;
  interest: InterestId;
  country: string;
  region: string;
  city: CityId;
  neighborhood: string;
  privacy: CommunityPrivacy;
  /** null when hidden from this viewer (locked private community) */
  memberCount: number | null;
  coverImage: string | null;
  locked: boolean;
  viewer: ViewerAccess;
}

export type GroupPolicy = "admins" | "members" | "off";

export interface CommunityDTO extends CommunityCardDTO {
  createdAt: ISODate;
  groupPolicy: GroupPolicy;
  /** the viewer may start a group here (server-computed from the policy and their role) */
  canCreateGroup: boolean;
  eventPolicy: "admins" | "members";
  /** the viewer may post events in this community */
  canHostEvents: boolean;
  owner: UserBrief | null;
  subcommunityCount: number | null;
  upcomingEventCount: number | null;
  /** only for owner/admin of a private community */
  inviteCode?: string;
}

export interface SubcommunityDTO {
  id: Id;
  slug: string;
  name: string;
  description: string;
  visibility: SubVisibility;
  memberCount: number | null;
  locked: boolean;
  createdAt: ISODate;
  parent: Pick<CommunityCardDTO, "id" | "slug" | "name" | "country" | "region" | "city" | "interest" | "privacy">;
  viewer: ViewerAccess;
  /** parent owner/admin moderating a private sub they are not a member of */
  moderationOnly?: boolean;
}

export interface PostDTO {
  id: Id;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: ISODate;
  author: UserBrief;
  canDelete: boolean;
}

export interface MemberDTO {
  user: UserBrief;
  role: Role;
  joinedAt: ISODate;
  canChangeRole: boolean;
  canRemove: boolean;
}

export type RequestStatus = "pending" | "approved" | "rejected";
export interface MembershipRequestDTO {
  id: Id;
  user: UserBrief;
  message: string;
  status: RequestStatus;
  createdAt: ISODate;
}

export interface InviteDTO {
  id: Id;
  code: string;
  createdAt: ISODate;
  expiresAt: ISODate | null;
  maxUses: number | null;
  uses: number;
  revoked: boolean;
  active: boolean;
}

/** What an invite link shows before accepting. Deliberately minimal. */
export interface InvitePreviewDTO {
  code: string;
  valid: boolean;
  reason?: "expired" | "revoked" | "used_up" | "not_found";
  target: {
    kind: "community" | "subcommunity";
    name: string;
    country: string;
    region: string;
    city: CityId;
    interest: InterestId;
    parentName?: string;
    slug: string;
    parentSlug?: string;
  } | null;
  alreadyMember: boolean;
}

export interface JoinResult {
  status: "joined" | "requested" | "already_member" | "already_requested";
  message: string;
}

/* ------------------------------- events ----------------------------- */

export type RsvpStatus = "going" | "interested";
export type EventAudience = "public" | "community" | "subcommunity";

export interface EventDTO {
  id: Id;
  title: string;
  description: string;
  interest: InterestId;
  country: string;
  region: string;
  city: CityId;
  neighborhood: string;
  /** an online event: `venue` is where to join (a link or platform name) */
  online: boolean;
  venue: string;
  startsAt: ISODate;
  endsAt: ISODate | null;
  /** price in major units of `currency` (field name is historical) */
  priceNaira: number;
  currency: string;
  capacity: number | null;
  coverImage: string | null;
  host: UserBrief;
  /** an event found elsewhere and approved by Klique: who really runs it, and where its tickets are */
  organizer: { name: string; url: string | null } | null;
  community: { slug: string; name: string; privacy: CommunityPrivacy } | null;
  subcommunity: { slug: string; name: string } | null;
  audience: EventAudience;
  goingCount: number;
  interestedCount: number;
  isPast: boolean;
  isFull: boolean;
  viewer: { rsvp: RsvpStatus | null; saved: boolean; isHost: boolean; canEdit: boolean };
}

/** Where the signed-in person may host events. */
export interface HostingOptionsDTO {
  public: { allowed: boolean; reason: "admin" | "verified" | "big-community" | "not-yet"; minMembers: number };
  communities: { slug: string; name: string; privacy: CommunityPrivacy; groupsOnly: boolean }[];
}

export interface AttendeesDTO {
  goingCount: number;
  interestedCount: number;
  /** empty when the viewer may not see names */
  people: UserBrief[];
  namesHidden: boolean;
}

/* ---------------------------- discovery ----------------------------- */

export interface DiscoverDTO {
  /** the scope that was used, e.g. "city:NG:lagos" */
  where: string;
  featured: EventDTO | null;
  eventsNearYou: EventDTO[];
  newCommunities: CommunityCardDTO[];
  suggestedCommunities: CommunityCardDTO[];
  yourScenes: { interest: InterestId; count: number }[];
}

export interface SearchResultsDTO {
  query: string;
  communities: CommunityCardDTO[];
  events: EventDTO[];
  people: UserBrief[];
}

/* ----------------------------- messaging ---------------------------- */

export interface ReactionDTO {
  kind: import("./reactions").ReactionKind;
  count: number;
  /** the viewer used this reaction */
  mine: boolean;
}

/** The message being answered, shown as a small quote above a reply. */
export interface ReplyRefDTO {
  id: Id;
  authorName: string;
  snippet: string;
  deleted: boolean;
}

export interface MessageDTO {
  id: Id;
  conversationId: Id;
  senderId: Id;
  body: string;
  sticker: string | null;
  /** up to 4 pictures */
  images: string[];
  replyTo: ReplyRefDTO | null;
  reactions: ReactionDTO[];
  createdAt: ISODate;
  mine: boolean;
  /** when the sender last changed the text (null if never) */
  editedAt: ISODate | null;
  /** unsent: body is empty */
  deleted: boolean;
}

export interface ConversationDTO {
  id: Id;
  other: UserBrief;
  lastMessage: { body: string; sticker?: string | null; senderId: Id; createdAt: ISODate; mine: boolean } | null;
  unreadCount: number;
  updatedAt: ISODate;
  /** true when the viewer blocked the other person (never reveals the reverse) */
  blockedByMe: boolean;
}

export interface ConversationDetailDTO {
  conversation: ConversationDTO;
  messages: MessageDTO[];
  hasMore: boolean;
  canSend: boolean;
  cannotSendReason?: string;
}

/* ------------------------------ safety ------------------------------ */

export type ReportTargetType = "user" | "post" | "event" | "community" | "subcommunity" | "message" | "channelMessage";

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: Id;
  reason: ReportReason;
  details?: string;
}

export interface BlockedUserDTO {
  user: UserBrief;
  blockedAt: ISODate;
}


/* ------------------------------ channels ---------------------------- */

export type ChannelType = "text" | "announcement" | "voice";
export type ChannelVisibility = "all" | "managers" | "invite";

export interface ChannelCategoryDTO {
  id: Id;
  name: string;
  position: number;
}

export interface ChannelDTO {
  id: Id;
  slug: string;
  name: string;
  topic: string;
  type: ChannelType;
  visibility: ChannelVisibility;
  categoryId: Id | null;
  position: number;
  lastMessageAt: ISODate | null;
  /** new messages since you last read (members only) */
  unread: boolean;
  /** the signed-in viewer may post here (server-computed; never trust the UI alone) */
  canPost: boolean;
  /** unread messages that tag the viewer (capped at 99) */
  mentions: number;
  /** guest-list size, for private channels (owners/admins only) */
  memberCount?: number;
}

/** A group the viewer belongs to, with the channels they can see in it. */
export interface ChannelGroupDTO {
  id: Id;
  slug: string;
  name: string;
  visibility: SubVisibility;
  role: Role | null;
  channels: ChannelDTO[];
}

export interface ChannelsDTO {
  categories: ChannelCategoryDTO[];
  channels: ChannelDTO[];
  /** only in a community's own list: the groups you're in (a group's own list has none) */
  groups: ChannelGroupDTO[];
}

export interface MentionDTO {
  id: Id;
  handle: string;
  displayName: string;
}

/** One community in the switcher rail. */
export interface MyCommunityDTO {
  id: Id;
  slug: string;
  name: string;
  interest: InterestId;
  coverImage: string | null;
  privacy: CommunityPrivacy;
  role: Role;
  unread: boolean;
  mentions: number;
  lastActivityAt: ISODate | null;
}

export interface LinkPreviewDTO {
  url: string;
  siteName: string;
  title: string;
  description: string;
  image: string | null;
  videoUrl: string | null;
}

export interface ChannelMessageDTO {
  id: Id;
  channelId: Id;
  /** empty when `deleted` */
  body: string;
  /** a sticker id (see lib/reactions.ts); the message has no text then */
  sticker: string | null;
  /** up to 4 pictures */
  images: string[];
  replyTo: ReplyRefDTO | null;
  /** pinned in the channel by an owner or admin */
  pinned: boolean;
  canPin: boolean;
  reactions: ReactionDTO[];
  deleted: boolean;
  createdAt: ISODate;
  /** when the author last changed the text (null if never) */
  editedAt: ISODate | null;
  author: UserBrief;
  canDelete: boolean;
  /** the viewer wrote it and may still change it */
  canEdit: boolean;
  /** people tagged with @handle */
  mentions: MentionDTO[];
  mentionsMe: boolean;
  /** only on optimistic client-side rows */
  pending?: boolean;
}

/** `hasMore` means "older messages exist" for the initial/`before` pages, "more new ones" for `after`. */
export interface ChatPage {
  items: ChannelMessageDTO[];
  hasMore: boolean;
}

export interface StaffDTO {
  user: UserBrief;
  role: Role;
}

/* ------------------------------ topics ------------------------------ */

/** A community's Reddit-style board: a titled post with threaded comments. */
export interface TopicMediaDTO {
  kind: "image" | "video";
  url: string;
  /** still frame shown before a video plays */
  poster: string | null;
}

/** A named section of a community's topics, set up by its admins. */
export interface BoardDTO {
  id: Id;
  slug: string;
  name: string;
  description: string;
  /** who may start topics here */
  postPolicy: "members" | "admins";
  topicCount: number;
  /** the viewer may start a topic in it right now */
  canPost: boolean;
}

export interface TopicDTO {
  id: Id;
  board: { id: Id; slug: string; name: string };
  title: string;
  body: string;
  /** pictures or one video, shown with the topic */
  media: TopicMediaDTO[];
  pinned: boolean;
  locked: boolean;
  likeCount: number;
  commentCount: number;
  /** the viewer liked it */
  liked: boolean;
  createdAt: ISODate;
  editedAt: ISODate | null;
  lastActivityAt: ISODate;
  author: UserBrief;
  /** which community it lives in (always set; the home feed shows it) */
  community: { id: Id; slug: string; name: string; interest: InterestId; coverImage: string | null };
  /** the viewer wrote it */
  canEdit: boolean;
  /** the viewer wrote it, or is an owner/admin who outranks the author */
  canDelete: boolean;
  /** the viewer is an owner/admin of the community: may pin and lock */
  canModerate: boolean;
  /** the viewer is a member: may like */
  canLike: boolean;
  /** the viewer may add a comment right now (member, topic not locked) */
  canComment: boolean;
}

export interface TopicCommentDTO {
  id: Id;
  topicId: Id;
  parentId: Id | null;
  /** empty when `deleted` */
  body: string;
  likeCount: number;
  liked: boolean;
  deleted: boolean;
  createdAt: ISODate;
  editedAt: ISODate | null;
  author: UserBrief;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TopicDetailDTO {
  topic: TopicDTO;
  /** every comment, oldest first; the client nests them by `parentId` */
  comments: TopicCommentDTO[];
}

export type TopicSort = "hot" | "new" | "top";

/* ------------------------------- voice ------------------------------- */

/** Everything a client needs to join one voice channel on LiveKit. The token is short-lived and only good for this room. */
export interface VoiceJoinDTO {
  url: string;
  token: string;
  room: string;
  identity: Id;
  /** minutes the token stays valid */
  validMinutes: number;
}

/* ------------------------------ uploads ------------------------------ */

/** Which kinds of upload this server can accept right now. */
export interface UploadStatusDTO {
  avatar: boolean;
  photo: boolean;
  video: boolean;
}

/** One signed, short-lived permission to upload a file straight to Cloudinary. */
export interface UploadSignatureDTO {
  kind: "avatar" | "photo" | "video";
  uploadUrl: string;
  /** form fields to send along with the file */
  fields: Record<string, string>;
  maxBytes: number;
  formats: string[];
  resource: "image" | "video";
}

/** What Cloudinary reports back once a file has arrived. */
export interface UploadedFileDTO {
  url: string;
  publicId: string;
  width: number | null;
  height: number | null;
  /** seconds, videos only */
  duration: number | null;
  /** a still frame for videos */
  poster: string | null;
}

/* ------------------------------ realtime ------------------------------ */

/**
 * A tiny "something changed here" ping pushed over Ably. It carries no message text: the client refetches
 * through the normal API, so every permission check still applies.
 */
export type RealtimeEvent =
  | { type: "channel"; communityId: Id; channelId: Id }
  | { type: "dm"; conversationId: Id }
  | { type: "topic"; communityId: Id; topicId: Id }
  /** the connection came back after a gap: refetch whatever is on screen */
  | { type: "resync" };

export interface RealtimeTokenDTO {
  /** pass to Ably's auth callback as-is */
  tokenRequest: Record<string, unknown>;
  /** the channels this person may listen on */
  channels: string[];
}

/** What the sign-in pages need to know about this server. */
export interface AuthConfigDTO {
  google: boolean;
  /** true when emails are really sent (SMTP configured) and unverified accounts are limited */
  emailVerification: boolean;
}

/* ------------------------------- admin ------------------------------ */

export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";
export type ReportAction = "dismiss" | "reviewing" | "remove" | "suspend" | "remove-and-suspend";

export interface ReportTargetDTO {
  /** what was reported, in a line */
  title: string;
  /** the reported words, when there are any */
  body: string;
  images: string[];
  /** who wrote / runs it (the person a suspension would hit) */
  author: UserBrief | null;
  /** where to look at it in the app */
  href: string | null;
  /** already deleted or gone */
  gone: boolean;
  /** "Remove" is offered for these; communities are too big a hammer for one click */
  removable: boolean;
}

export interface ReportDTO {
  id: Id;
  status: ReportStatus;
  targetType: ReportTargetType;
  targetId: Id;
  reason: string;
  details: string;
  createdAt: ISODate;
  reporter: UserBrief | null;
  /** open reports about the same thing, this one included */
  openCount: number;
  target: ReportTargetDTO;
}

export interface AdminUserDTO extends UserBrief {
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  canHostPublic: boolean;
  suspended: boolean;
  suspendedReason: string;
  createdAt: ISODate;
}

export type DraftStatus = "pending" | "approved" | "rejected";

/** An event the finder picked up, waiting for an admin in the inbox. */
export interface DraftDTO {
  id: Id;
  status: DraftStatus;
  sourceUrl: string;
  sourceName: string;
  title: string;
  description: string;
  interest: InterestId;
  organizerName: string;
  country: string;
  region: string;
  city: string;
  venue: string;
  online: boolean;
  startsAt: ISODate | null;
  endsAt: ISODate | null;
  price: number;
  currency: string;
  coverImage: string | null;
  eventId: Id | null;
  createdAt: ISODate;
}

export type DraftPatch = Partial<Pick<DraftDTO, "title" | "description" | "interest" | "organizerName" | "country" | "region" | "city" | "venue" | "online" | "startsAt" | "endsAt" | "price" | "currency" | "coverImage">>;

export interface ImportResult {
  found: number;
  added: number;
  /** already in the inbox (or already approved / rejected) */
  skipped: number;
  /** in the past, so not worth reviewing */
  past: number;
}

/** A page the nightly finder checks for events. */
export interface SourceDTO {
  id: Id;
  url: string;
  name: string;
  lastRunAt: ISODate | null;
  lastFound: number;
  lastError: string;
}

export interface AdminSummaryDTO {
  reports: Record<ReportStatus, number>;
  pendingDrafts: number;
  hostMinMembers: number;
}

export type AdminUserFilter = "all" | "new" | "admins" | "hosts" | "suspended" | "unverified";

/** One line of the audit log. */
export interface AuditEntryDTO {
  id: Id;
  admin: UserBrief | null;
  action: string;
  targetType: string;
  targetId: Id | null;
  targetLabel: string;
  note: string;
  createdAt: ISODate;
  /** where the target lives in the app, while it still exists */
  href: string | null;
}

export interface AdminOverviewDTO {
  people: { total: number; new7d: number; newPrev7d: number; suspended: number; verifiedHosts: number; unverified: number };
  events: { upcoming: number; thisWeek: number; created7d: number; imported: number };
  communities: { total: number; new7d: number; large: number };
  queue: { openReports: number; pendingDrafts: number };
  /** sign-ups per day, oldest first, the last 30 days (YYYY-MM-DD, UTC) */
  signups: { day: string; count: number }[];
  recent: AuditEntryDTO[];
  hostMinMembers: number;
}

export interface AdminUserDetailDTO {
  user: AdminUserDTO;
  googleLinked: boolean;
  hasPassword: boolean;
  stats: { communitiesOwned: number; memberships: number; eventsHosted: number; reportsAgainst: number; reportsFiled: number };
  communities: { slug: string; name: string; memberCount: number }[];
  events: { id: Id; title: string; startsAt: ISODate; cancelled: boolean }[];
  history: AuditEntryDTO[];
}

export type AdminEventFilter = "upcoming" | "past" | "cancelled" | "imported";

export interface AdminEventRow {
  id: Id;
  title: string;
  startsAt: ISODate;
  cancelled: boolean;
  audience: "public" | "community" | "subcommunity";
  coverImage: string | null;
  goingCount: number;
  country: string;
  city: string;
  online: boolean;
  host: UserBrief | null;
  community: { slug: string; name: string } | null;
  /** came in through the event finder */
  imported: boolean;
  createdAt: ISODate;
}

export interface AdminCommunityRow {
  id: Id;
  slug: string;
  name: string;
  interest: InterestId;
  privacy: CommunityPrivacy;
  memberCount: number;
  coverImage: string | null;
  country: string;
  city: string;
  owner: UserBrief | null;
  /** big enough that its owner can post public events */
  hostsPublic: boolean;
  createdAt: ISODate;
}

export interface SystemStatusDTO {
  checks: { id: string; label: string; ok: boolean; detail: string; optional?: boolean }[];
  admins: string[];
  hostMinMembers: number;
  appUrl: string;
  environment: string;
}
