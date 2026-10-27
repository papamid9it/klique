/**
 * API contract shared by the backend (server/serializers) and every client
 * (this web app today; mobile / desktop later). Pure types — no runtime code.
 */
import type { CityId, DmPolicy, InterestId, Presence, ProfileVisibility, ReportReason } from "./constants";
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
  /** points: earned reputation shown on the profile (can't be bought) */
  points: number;
  pronouns: string;
  /** the status they set: the dot on their picture ("invisible" shows none) */
  presence: Presence;
  /** two colours tinting their profile card, and an animated layer over it (Hype designs) */
  profileTheme: { primary: string; accent: string } | null;
  profileEffect: string | null;
}

/** The signed-in user's own account. */
/** Where someone is in /welcome: categories picked, communities joined, what to suggest. */
export interface OnboardingDTO {
  interests: string[];
  minInterests: number;
  /** communities joined (not counting Klique) */
  joined: number;
  /** how many they must join to finish (2, or fewer when there aren't enough to join) */
  needed: number;
  /** nothing (much) matched their categories, so these are from any category */
  widened: boolean;
  /** the ones they've joined first, then suggestions: their city, their country, then anywhere */
  suggestions: CommunityCardDTO[];
  done: boolean;
}

export interface UserMe extends UserProfile {
  email: string;
  emailVerified: boolean;
  /** has been through /welcome (picked categories, joined communities) */
  onboarded: boolean;
  /** false for Google-only accounts: they can add a password without entering a current one */
  hasPassword: boolean;
  googleLinked: boolean;
  mood: MoodId;
  privacy: UserPrivacy;
  dmPolicy: DmPolicy;
  unreadMessages: number;
  /** unread entries in the notification inbox (the bell) */
  unreadNotifications: number;
  /** Hype balance, bought (spent on picture frames and name styles) */
  hype: number;
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
  /** groups: the community's owner or a site admin (sees and manages every group, may delete it) */
  canModerate?: boolean;
  /** a member who can't post yet: the points this space asks for (they have fewer) */
  pointsToPost?: number;
}

export interface CommunityCardDTO {
  id: Id;
  slug: string;
  name: string;
  /** made by Klique; the default "Klique" community everyone is in */
  official: boolean;
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
  /** points (lib/points) needed to join and to post; 0 when anyone can */
  minPointsJoin: number;
  minPointsPost: number;
  viewer: ViewerAccess;
}

export type GroupPolicy = "admins" | "members" | "off";

export interface CommunityDTO extends CommunityCardDTO {
  createdAt: ISODate;
  groupPolicy: GroupPolicy;
  /** the viewer may start a group here (server-computed from the policy and their role) */
  canCreateGroup: boolean;
  /** the viewer may post events in this community (its owner and admins) */
  canHostEvents: boolean;
  /** members may send events in for approval */
  memberEvents: boolean;
  /** the viewer is a member who can send an event in for the owner or an admin to approve */
  canSubmitEvents: boolean;
  /** the Posts section: "off", or who may post ("admins" or "members") */
  feedPolicy: GroupPolicy;
  /** the viewer may post there */
  canPostToFeed: boolean;
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
  /** points (lib/points) needed to be added, and to post; 0 when anyone can */
  minPointsJoin: number;
  minPointsPost: number;
  createdAt: ISODate;
  parent: Pick<CommunityCardDTO, "id" | "slug" | "name" | "country" | "region" | "city" | "interest" | "privacy">;
  viewer: ViewerAccess;
  /** parent owner/admin moderating a private sub they are not a member of */
  moderationOnly?: boolean;
}

/* ------------------------- community posts ------------------------- */

/** A post in a community's Posts section (Instagram style). */
export interface FeedPostDTO {
  id: Id;
  community: { id: Id; slug: string; name: string; interest: InterestId; coverImage: string | null; privacy: CommunityPrivacy };
  author: UserBrief;
  caption: string;
  /** pictures, or one video */
  media: TopicMediaDTO[];
  upCount: number;
  downCount: number;
  /** the viewer's vote: 1 up, -1 down, 0 none */
  myVote: 1 | -1 | 0;
  commentCount: number;
  createdAt: ISODate;
  editedAt: ISODate | null;
  /** the viewer is a member of its community (may vote and comment) */
  isMember: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface FeedCommentDTO {
  id: Id;
  postId: Id;
  parentId: Id | null;
  /** empty when deleted */
  body: string;
  deleted: boolean;
  createdAt: ISODate;
  author: UserBrief;
  reactions: ReactionDTO[];
  canDelete: boolean;
}

/** One entry in the home feed: a post from your communities, or now and then a trending one from elsewhere. */
export interface HomeFeedItem {
  post: FeedPostDTO;
  /** from a public community you're not in (shown with a Join button) */
  trending: boolean;
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
  /** the host's ticket page ("Get tickets") */
  ticketUrl: string | null;
  /** the link to join an online event ("Join online") */
  onlineUrl: string | null;
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
  /** `official`: it's in Klique, the default community everyone's in (so everyone sees it) */
  community: { slug: string; name: string; privacy: CommunityPrivacy; official?: boolean } | null;
  subcommunity: { slug: string; name: string } | null;
  audience: EventAudience;
  goingCount: number;
  interestedCount: number;
  /** crews heading there together */
  crewCount: number;
  isPast: boolean;
  isFull: boolean;
  /** `mustJoin`: a community's event the viewer isn't a member of: going or saving it means joining first */
  viewer: { rsvp: RsvpStatus | null; saved: boolean; isHost: boolean; canEdit: boolean; mustJoin?: boolean; canReview?: boolean; canManageMoney?: boolean };
  /** a member's event not approved yet: waiting for the space's owner or an admin, or turned down (with why) */
  review: { status: "pending" | "rejected"; reason: string } | null;
  /** chipping in toward it (lib/money): so much a unit; what's been raised; the viewer's units; paid out yet */
  contribution: EventContributionDTO | null;
}

/* ------------------------------ crews ------------------------------- */

export type CrewJoinMode = "open" | "approval";
/** where the viewer stands with a crew */
export type CrewStanding = "host" | "member" | "pending" | null;

/** A crew in a list: enough to decide whether to join. The exact meetup point stays hidden until you're in. */
export interface CrewCardDTO {
  id: Id;
  eventId: Id;
  area: string;
  note: string;
  meetupAt: ISODate;
  joinMode: CrewJoinMode;
  maxMembers: number;
  memberCount: number;
  host: UserBrief;
  /** a few faces of who's in, host first */
  faces: UserBrief[];
  isFull: boolean;
  /** the event has started: no more joining */
  closed: boolean;
  /** the community (and group) the event lives in, where the crew is shown; null for events outside any community */
  space: { slug: string; sub: string | null } | null;
  viewer: { standing: CrewStanding };
}

/** A crew you're in (or asked to join), for the community's left panel. */
export interface MyCrewDTO {
  id: Id;
  area: string;
  eventId: Id;
  eventTitle: string;
  meetupAt: ISODate;
  memberCount: number;
  standing: Exclude<CrewStanding, null>;
  /** the group the event lives in, if any */
  sub: string | null;
  /** unread chat messages (members only; capped at 99) */
  unreadCount: number;
}

export interface CrewDTO extends CrewCardDTO {
  /** null unless you're in the crew */
  meetupPoint: string | null;
  event: { id: Id; title: string; startsAt: ISODate; endsAt: ISODate | null; venue: string; online: boolean; coverImage: string | null; city: CityId; country: string };
  members: UserBrief[];
  /** join requests waiting (host only) */
  requests: { user: UserBrief; message: string; createdAt: ISODate }[];
  /** when it all disappears */
  expiresAt: ISODate;
  viewer: {
    standing: CrewStanding;
    canEdit: boolean;
    canChat: boolean;
    canJoin: boolean;
    joinBlockedReason: string | null;
    /** join this community (sub = null) or group first; `ask`: it takes a request; `requested`: one is waiting */
    joinSpace: { slug: string; sub: string | null; name: string; ask: boolean; requested: boolean } | null;
  };
}

export interface EventCrewsDTO {
  /** the first `limit` crews (yours first), matching `q` when searching */
  crews: CrewCardDTO[];
  /** how many crews match */
  total: number;
  /** more match than are shown ("Load more") */
  hasMore: boolean;
  /** your crew for this event (hosting, in, or asked), if any */
  mine: Id | null;
  canStart: boolean;
  /** why you can't start one, in words */
  startBlockedReason: string | null;
  /** you could join a crew here (signed in, verified, a member of the event's community or group) */
  canJoin: boolean;
}

/** Where the signed-in person may host events. */
export interface HostingOptionsDTO {
  /** site admins may post anywhere, including public events outside any community */
  siteAdmin: boolean;
  /** `submit`: a member's community, where an event waits for the owner or an admin to approve it */
  communities: { slug: string; name: string; privacy: CommunityPrivacy; groupsOnly: boolean; submit?: boolean }[];
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
  /** signed in: your next events you're going to (any place) */
  yourPlans: EventDTO[];
  /** events per day for the next 7 days here, starting today (YYYY-MM-DD, Lagos time) */
  week: { day: string; count: number }[];
  thisWeekend: EventDTO[];
  /** upcoming events in communities you've joined */
  fromCommunities: EventDTO[];
  free: EventDTO[];
  online: EventDTO[];
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
  /** a picture sticker (see SavedStickerDTO); the message has no text then */
  stickerUrl: string | null;
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
  /** a poll posted with this message */
  pollId?: Id | null;
}

/** A picture someone saved as a sticker. `url` is the file itself; thumbnails use its small copy (lib/cdn). */
export interface SavedStickerDTO {
  id: Id;
  url: string;
  /** times you sent it, and when last (for "Most used") */
  uses: number;
  lastUsedAt: ISODate | null;
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

export type ReportTargetType = "user" | "post" | "event" | "community" | "subcommunity" | "message" | "channelMessage" | "ad" | "feedPost";

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
  /** how many (other people's messages, capped at 99; 0 when read) */
  unreadCount: number;
  /** the signed-in viewer may post here (server-computed; never trust the UI alone) */
  canPost: boolean;
  /** unread messages that tag the viewer (capped at 99) */
  mentions: number;
  /** guest-list size, for private channels (owners/admins only) */
  memberCount?: number;
  /** slow mode: seconds each person waits between messages (0 = off) */
  slowModeSec: number;
  /** the viewer doesn't wait (owners, admins, site admins) */
  slowModeExempt: boolean;
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
/** One community's left side, for preloading (GET /api/me/sidebars). Locked communities have no channels/boards. */
export interface SidebarDTO {
  community: CommunityDTO;
  channels: ChannelsDTO | null;
  boards: BoardDTO[] | null;
}

export interface MyCommunityDTO {
  id: Id;
  slug: string;
  name: string;
  interest: InterestId;
  coverImage: string | null;
  privacy: CommunityPrivacy;
  role: Role;
  unread: boolean;
  /** unread messages across its channels you can see, and your crews' chats there (capped at 99) */
  unreadCount: number;
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
  /** a picture sticker (see SavedStickerDTO); the message has no text then */
  stickerUrl: string | null;
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
  /** a poll posted with this message (load it with PollService) */
  pollId?: Id | null;
  /** only on optimistic client-side rows */
  pending?: boolean;
}

/** A poll posted in a chat (see ChannelMessageDTO.pollId / MessageDTO.pollId). */
export interface PollDTO {
  id: Id;
  question: string;
  answers: { id: string; text: string; emoji: string | null; votes: number }[];
  /** people who voted (with several answers each, the answer counts can add up to more) */
  totalVoters: number;
  multiple: boolean;
  anonymous: boolean;
  /** when it ends, or ended (early, if someone ended it) */
  endsAt: ISODate;
  ended: boolean;
  /** the viewer's answer ids */
  myVotes: string[];
  canVote: boolean;
  canEnd: boolean;
  /** tapping an answer shows who picked it (not for anonymous polls or big communities) */
  votersVisible: boolean;
  creator: UserBrief | null;
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
  /** house rules, one per line ("" when none) */
  rules: string;
  /** who may start topics here */
  postPolicy: "members" | "admins";
  topicCount: number;
  /** the viewer may start a topic in it right now */
  canPost: boolean;
}

/** What the desktop sidebar beside a board shows (refreshed live as people post and comment). */
/** One profile effect people can unlock with Hype (uploaded by a site admin). */
export interface ProfileEffectDTO {
  /** its slug: what a profile stores */
  id: string;
  name: string;
  /** "image": an animated WebP or APNG; "lottie": a Lottie JSON */
  kind: "image" | "lottie";
  fileUrl: string;
  /** a still picture: the tile, and what people who want things still see */
  previewUrl: string;
  active: boolean;
  /** Hype */
  price: number;
}

/* ------------------------------ money ------------------------------ */

export interface EventContributionDTO {
  label: string;
  unitPrice: number;
  maxQuantity: number;
  /** paid, not refunded */
  raised: number;
  contributors: number;
  /** units the viewer has paid for */
  mine: number;
  /** the community has been paid what was raised */
  withdrawn: boolean;
}

export interface DonationButtonDTO {
  id: Id;
  title: string;
  description: string;
  goal: number | null;
  raised: number;
  donors: number;
  active: boolean;
}

export interface PaymentDTO {
  id: Id;
  kind: "donation" | "contribution";
  user: UserBrief;
  amount: number;
  fee: number;
  net: number;
  quantity: number;
  message: string;
  status: "pending" | "paid" | "refunded";
  createdAt: ISODate;
  /** what it was for */
  forTitle: string;
  eventId: Id | null;
  /** a contribution not paid out yet: the host or an admin may refund it (minus the fee) */
  refundable: boolean;
}

export interface PayoutDTO {
  id: Id;
  amount: number;
  status: "requested" | "paid" | "rejected";
  bank: { bankName: string; accountName: string; accountNumber: string; bankCode: string };
  reference: string;
  note: string;
  createdAt: ISODate;
  decidedAt: ISODate | null;
  community?: { slug: string; name: string };
  requestedBy?: UserBrief;
}

/** A community's money, for its owner and admins. */
export interface CommunityMoneyDTO {
  fees: { donationPercent: number; contributionPercent: number };
  minPayout: number;
  /** paid in and not paid out (after Klique's fee) */
  available: number;
  /** waiting in a payout request */
  requested: number;
  paidOut: number;
  totals: { donations: number; contributions: number; last30: number };
  buttons: DonationButtonDTO[];
  recent: PaymentDTO[];
  payouts: PayoutDTO[];
  bank: PayoutDTO["bank"] | null;
  /** card payments are set up */
  canTakePayments: boolean;
  /** the owner asks for payouts */
  canRequestPayout: boolean;
}

/** A community's owner dashboard (owners and admins). */
export interface CommunityDashboardDTO {
  members: { total: number; new7: number; new30: number; perDay: { day: string; joined: number }[] };
  /** members' events waiting for approval, oldest first */
  pendingEvents: EventDTO[];
  /** people asking to join (private communities) */
  pendingRequests: number;
  activity: { posts7: number; upcomingEvents: number };
}

/** Beside a community's Posts: who posted the most in the last 7 days (and the upvotes they got). */
export interface FeedSidebarDTO {
  topPosters: { user: UserBrief; posts: number; upvotes: number }[];
}

export interface BoardSidebarDTO {
  /** the most liked and discussed topics active in the last 7 days */
  trending: { id: Id; title: string; likeCount: number; commentCount: number }[];
  /** who posted and commented the most here in the last 7 days */
  contributors: { user: UserBrief; topics: number; comments: number }[];
  /** owners and admins may edit the rules */
  canEdit: boolean;
}

export interface TopicDTO {
  id: Id;
  board: { id: Id; slug: string; name: string };
  title: string;
  body: string;
  /** its picture (new posts have at most one; older ones may have several, or a video) */
  media: TopicMediaDTO[];
  pinned: boolean;
  locked: boolean;
  /** upvotes */
  likeCount: number;
  /** replies in its chat */
  commentCount: number;
  tags: string[];
  /** the viewer upvoted it */
  liked: boolean;
  /** the viewer hears about new replies */
  following: boolean;
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
  /** the post's chat (its replies): a channel that never shows in the channel list */
  thread: ChannelDTO;
  /** the chat's newest page, so the post and its replies show together */
  messages: ChatPage;
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
  effect: boolean;
}

/** Short-lived permission to put one upload (and its small copy or still frame) straight into storage. */
export interface UploadSignatureDTO {
  kind: "avatar" | "photo" | "video" | "effect";
  resource: "image" | "video" | "file";
  items: { variant: "main" | "sm" | "poster"; uploadUrl: string; headers: Record<string, string>; url: string }[];
}

/** A finished upload. */
export interface UploadedFileDTO {
  url: string;
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
  /** something was sent to you (see lib/notifications); `ref` says what changed ("crew:<id>"…) so open pages refresh */
  | { type: "notify"; category: string; ref: string | null; inbox: boolean }
  /** something changed in a crew you're in (someone joined or left, a new chat message…) */
  | { type: "crew"; crewId: Id; chat?: boolean }
  /** your saved stickers changed (on another device, or this one) */
  | { type: "stickers" }
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
  /** where it was found: an event page, a calendar, a feed, or an official API */
  provider: "page" | "ical" | "rss" | "ticketmaster" | "eventbrite" | "link";
  /** the source's own picture (a reference: only official APIs' pictures may be used as the cover) */
  sourceImage: string | null;
  imageReusable: boolean;
  /** the time zone the source gave its times in */
  timezone: string;
  eventId: Id | null;
  createdAt: ISODate;
}

export type DraftPatch = Partial<Pick<DraftDTO, "title" | "description" | "interest" | "organizerName" | "country" | "region" | "city" | "venue" | "online" | "startsAt" | "endsAt" | "price" | "currency" | "coverImage">>;

/** What to look for in Admin → Event finder. `country` "" = anywhere. */
export interface FinderQueryDTO {
  country: string;
  region: string;
  city: string;
  interests: string[];
  from: ISODate;
  to: ISODate;
  includeSources: boolean;
  urls: string[];
}

export interface FinderTaskDTO {
  kind: "ticketmaster" | "eventbrite" | "source" | "url" | "follow";
  label: string;
  status: "pending" | "running" | "done" | "failed";
  found: number;
  added: number;
  note: string;
}

/** One "Find events" job, worked through a source at a time. */
export interface FinderRunDTO {
  id: Id;
  status: "running" | "done" | "failed";
  trigger: "admin" | "saved" | "nightly";
  query: FinderQueryDTO;
  tasks: FinderTaskDTO[];
  /** tasks finished (done or failed) */
  done: number;
  found: number;
  added: number;
  duplicates: number;
  filtered: number;
  createdAt: ISODate;
  finishedAt: ISODate | null;
}

/** A search re-run every night; its finds only go to the review queue. */
export interface SavedSearchDTO {
  id: Id;
  name: string;
  country: string;
  region: string;
  city: string;
  interests: string[];
  days: number;
  includeSources: boolean;
  daily: boolean;
  lastRunAt: ISODate | null;
  lastAdded: number;
}

/** Posting or rejecting many drafts at once: what went through, and what didn't (with why). */
export interface DraftBulkResult {
  done: { id: Id; title: string; eventId?: Id }[];
  failed: { id: Id; title: string; message: string }[];
}

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
  /** ad requests waiting for review */
  pendingAds: number;
  /** community payouts waiting to be sent */
  pendingPayouts: number;
}

export type AdminUserFilter = "all" | "new" | "admins" | "suspended" | "unverified";

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
  people: { total: number; new7d: number; newPrev7d: number; suspended: number; unverified: number };
  events: { upcoming: number; thisWeek: number; created7d: number; imported: number };
  communities: { total: number; new7d: number; large: number };
  queue: { openReports: number; pendingDrafts: number };
  /** sign-ups per day, oldest first, the last 30 days (YYYY-MM-DD, UTC) */
  signups: { day: string; count: number }[];
  recent: AuditEntryDTO[];
  /** the size from which a community counts as large */
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
  createdAt: ISODate;
}

export interface SystemStatusDTO {
  checks: { id: string; label: string; ok: boolean; detail: string; optional?: boolean }[];
  admins: string[];
  appUrl: string;
  environment: string;
}

/* -------------------------------- ads ------------------------------- */

/** "communities": "Sponsored communities" on the Communities page (sponsored-community ads only) */
export type AdSlot = "home-feed" | "home-rail" | "events-list" | "event-page" | "search" | "communities";

/** An ad as the app shows it. Always rendered with a "Sponsored" label. */
export interface AdDTO {
  id: Id;
  kind: "event" | "brand" | "community";
  advertiser: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  /** brand ads: where the button goes (opens in a new tab) */
  url: string | null;
  /** promoted events: the event itself */
  event: EventDTO | null;
  /** sponsored communities: the community */
  community?: { id: Id; slug: string; name: string; interest: InterestId; coverImage: string | null; memberCount: number } | null;
}

export interface AdInput {
  name: string;
  kind: "event" | "brand" | "community";
  eventId?: string | null;
  communityId?: string | null;
  advertiser?: string;
  title?: string;
  body?: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  url?: string;
  slots: AdSlot[];
  places: string[];
  interests: InterestId[];
  keywords: string[];
  startsAt?: ISODate | null;
  endsAt?: ISODate | null;
  weight: number;
  status?: "active" | "paused";
}

/** An ad in the admin console, with its numbers. */
export interface AdminAdDTO extends Required<Omit<AdInput, "eventId" | "communityId" | "status">> {
  id: Id;
  status: "active" | "paused";
  /** shown now: active and inside its dates */
  live: boolean;
  event: { id: Id; title: string; startsAt: ISODate; cancelled: boolean } | null;
  eventId: Id | null;
  community: { id: Id; slug: string; name: string } | null;
  communityId: Id | null;
  impressions: number;
  clicks: number;
  reports: number;
  /** bought by a host through Paystack */
  paid: { by: UserBrief | null; amount: number; currency: string; days: number } | null;
  /** a paid promotion waiting for your approval; resuming it approves it and starts its run */
  pendingReview: boolean;
  createdAt: ISODate;
}

/* ---------------------------- promotions ---------------------------- */

export interface PromotionDTO {
  id: Id;
  days: number;
  reach: string;
  reachLabel: string;
  /** major units (naira) */
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  paidAt: ISODate | null;
  /** the ad it became, once paid */
  ad: { live: boolean; pendingReview: boolean; startsAt: ISODate | null; endsAt: ISODate | null; impressions: number; clicks: number } | null;
  createdAt: ISODate;
}

/** What a host can buy for one event. */
export interface PromoteOptionsDTO {
  /** false when payments aren't set up, or the event can't be promoted */
  available: boolean;
  reason: string | null;
  event: { id: Id; title: string; startsAt: ISODate };
  currency: string;
  days: number[];
  reaches: { scope: string; label: string; hint: string }[];
  /** prices[scope][days] in major units */
  prices: Record<string, Record<string, number>>;
  review: boolean;
  promotions: PromotionDTO[];
}

/* --------------------------- notifications --------------------------- */

export interface NotificationDTO {
  id: Id;
  category: string;
  title: string;
  body: string;
  href: string;
  /** how many bundled into this one */
  count: number;
  read: boolean;
  updatedAt: ISODate;
  /** who did it (the newest few of a bundle) */
  actors: UserBrief[];
  /** a picture for the line (an event's cover) */
  image: string | null;
  /** answered right from the line */
  action: { kind: "crewRequest"; crewId: Id; userId: Id } | { kind: "communityRequest"; slug: string; requestId: Id } | { kind: "event"; eventId: Id } | { kind: "eventReview"; eventId: Id } | null;
}

/** What's waiting on you (the right column of Notifications): join requests you can answer right there. */
export interface PendingDTO {
  crewRequests: { crewId: Id; area: string; eventTitle: string; user: UserBrief; message: string }[];
  communityRequests: { slug: string; communityName: string; requestId: Id; user: UserBrief; message: string }[];
  /** members' events waiting for this owner or admin to approve them */
  eventReviews: { eventId: Id; title: string; communityName: string; user: UserBrief }[];
}

/* ------------------------------- ad requests ------------------------------- */

export type AdCampaignStatus = "pending" | "changes" | "rejected" | "approved" | "paid" | "cancelled";
/** where an ad request is, in words people use: waiting, needs changes, … running, ended */
export type AdCampaignPhase = "pending" | "changes" | "rejected" | "approved" | "scheduled" | "live" | "ended" | "cancelled";

export interface AdCampaignDTO {
  id: Id;
  kind: "event" | "community" | "brand";
  status: AdCampaignStatus;
  phase: AdCampaignPhase;
  advertiser: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  url: string;
  event: { id: Id; title: string; startsAt: ISODate; coverImage: string | null } | null;
  community: { slug: string; name: string; coverImage: string | null } | null;
  placements: string[];
  reach: "city" | "country" | "world";
  place: string | null;
  placeLabel: string;
  days: number;
  startOn: ISODate | null;
  amount: number;
  currency: string;
  reviewNote: string;
  paymentMethod: "paystack" | "manual" | null;
  paidAt: ISODate | null;
  startsAt: ISODate | null;
  endsAt: ISODate | null;
  impressions: number;
  clicks: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** who asked (admin view) */
  user?: UserBrief;
  /** card payment through Paystack is set up */
  canPayOnline: boolean;
}

export interface AdCampaignInput {
  kind: "event" | "community" | "brand";
  eventId?: string;
  communitySlug?: string;
  advertiser?: string;
  title?: string;
  body?: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  url?: string;
  placements: string[];
  reach: "city" | "country" | "world";
  place?: string | null;
  days: number;
  startOn?: string | null;
}

/* ------------------------------ Hype (bought) ------------------------------ */

export interface StyleUnlockDTO {
  /** "frame:fire", "name:gold-shimmer" */
  key: string;
  name: string;
  expiresAt: string;
  autoRenew: boolean;
  /** "gift": free (worn before unlocks existed, or given by an admin) */
  source: "hype" | "gift";
  /** what renewing costs now */
  price: number;
}

export interface HypeTxnDTO {
  id: string;
  amount: number;
  balanceAfter: number;
  /** "earn": from the old ranks, before Hype could only be bought */
  kind: "purchase" | "unlock" | "renew" | "grant" | "revoke" | "earn";
  note: string;
  createdAt: string;
}

/** Your Hype: balance, what you've unlocked, prices, packs to buy and your history. */
export interface HypeWalletDTO {
  balance: number;
  /** site admins: every design is free, nothing to unlock */
  allFree: boolean;
  config: import("./wallet").WalletConfig;
  unlocks: StyleUnlockDTO[];
  history: HypeTxnDTO[];
  hasMoreHistory: boolean;
  /** card payments are set up (Paystack keys present) */
  canBuy: boolean;
}

export interface HypeSaleDTO {
  id: string;
  user: UserBrief | null;
  hype: number;
  amount: number;
  status: "pending" | "paid";
  createdAt: string;
  paidAt: string | null;
}

export interface AdminHypeOverviewDTO {
  /** naira and Hype sold, last 30 days and all time */
  sales: { last30: { amount: number; hype: number; count: number }; all: { amount: number; hype: number; count: number } };
  /** Hype people hold right now */
  outstanding: number;
  /** designs being worn on Hype right now */
  activeUnlocks: number;
  recent: HypeSaleDTO[];
}

/** One person, for Admin → Points: their Hype (with unlocks and history) and their points. */
export interface AdminWalletUserDTO {
  user: UserBrief;
  hype: number;
  points: number;
  unlocks: StyleUnlockDTO[];
  history: HypeTxnDTO[];
}

/* ------------------------------ points (earned) ------------------------------ */

/** Your points, what earns them, and how much of each you can still earn today. */
export interface PointsProgressDTO {
  points: number;
  actions: { id: import("./points").PointAction; label: string; hint: string; worth: number; todayLeft: number }[];
  recent: { action: import("./points").PointAction; amount: number; createdAt: ISODate }[];
}

/** The host's "Who came?" list. */
export interface AttendanceDTO {
  /** ticking is allowed now (from the start until a week after the end) */
  open: boolean;
  opensAt: ISODate;
  closesAt: ISODate;
  people: { user: UserBrief; attended: boolean }[];
}
