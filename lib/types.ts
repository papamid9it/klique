/**
 * API contract shared by the backend (server/serializers) and every client
 * (this web app today; mobile / desktop later). Pure types — no runtime code.
 */
import type { MessageCard } from "./cards";
import type { CityId, DmPolicy, InterestId, Presence, ProfileVisibility, ReportReason } from "./constants";
import type { MoodPref } from "./moods";

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

/** A community role's emoji and name, shown on someone's picture inside that community. */
export interface RoleBadge {
  icon: string;
  name: string;
}

export interface UserBrief {
  id: Id;
  handle: string;
  displayName: string;
  /** the badge by their name: Klique Team (site admins), or a Lite or Pro member */
  badge?: "team" | "lite" | "pro" | null;
  avatarUrl: string | null;
  /** animated ring around the picture (lib/cosmetics FrameId), if chosen */
  avatarFrame?: string | null;
  /** animated name style (lib/cosmetics NameEffectId), if chosen */
  nameEffect?: string | null;
  /** ISO country code, e.g. "NG" */
  country: string;
  city: CityId;
  /** a bot's account (BOT tag) */
  bot?: boolean;
}

export interface UserPrivacy {
  profileVisibility: ProfileVisibility;
  attendancePublic: boolean;
    /** others can see the communities you created, on your profile */
    createdCommunitiesPublic: boolean;
    /** others can see how many people are in the communities you created */
    communityReachPublic: boolean;
}

export interface UserProfile extends UserBrief {
  bio: string;
  /** their socials: a username per site (lib/socials), not sent for a profile you can't see */
  socials?: import("./socials").SocialLink[];
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
  /** photos and short videos on their profile, in order (as many as their plan shows) */
  media: TopicMediaDTO[];
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
  mood: MoodPref;
  privacy: UserPrivacy;
  dmPolicy: DmPolicy;
  unreadMessages: number;
  /** unread entries in the notification inbox (the bell) */
  unreadNotifications: number;
  /** Hype balance, bought (spent on picture frames and name styles) */
  hype: number;
  /** a site admin (opens /admin) */
  isAdmin: boolean;
  /** date of birth ("YYYY-MM-DD"), set once (then only Klique can change it), and what it allows (policies/adult) */
  dob: string | null;
  dobLocked: boolean;
  /** optional; only used for "Women only" kliques */
  gender: "woman" | "man" | "unspecified";
  isAdult: boolean;
  /** said "I'm 18 or older" (before first entering an 18+ community) */
  adultConfirmed: boolean;
  /** Show explicit content: on since this moment (null: off). Phone apps can only switch it off; on is web only */
  explicitOnAt: ISODate | null;
}

/** What a viewer is allowed to know about a profile. */
export interface ProfileView {
  profile: UserProfile;
  isSelf: boolean;
  /** false when privacy hides the profile body; `profile` then only has brief fields */
  visible: boolean;
  hiddenReason?: "private" | "members" | "friends";
  communities: CommunityCardDTO[];
  /** the ones they started and still own (private ones only for their members, 18+ only for themselves) */
  createdCommunities: CommunityCardDTO[];
  /** everyone across the communities they created (null: none, or they hide it). Klique's own follower count */
  communityReach: number | null;
  /** at least one of those communities is verified (shown with the total, even when the list is hidden) */
  communityReachVerified: boolean;
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
  /** allowed, but only as a message request (one text message, waiting for them to accept) */
  request?: boolean;
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
  /** may open the member list (owners, admins, moderators; members don't see each other's list) */
  canSeeMembers?: boolean;
  /** may read posts/events/members */
  canView: boolean;
  /** may create posts / events here */
  canPost: boolean;
  /** groups: the community's owner or a site admin (sees and manages every group, may delete it) */
  canModerate?: boolean;
  /** a member who can't post yet: the points this space asks for (they have fewer) */
  pointsToPost?: number;
  /** timed out in this community until then (they can read, not post or react) */
  timedOutUntil?: ISODate | null;
  /** stopped from writing in Posts and on Boards (until: null = until it's lifted); they can still chat */
  postBan?: { until: ISODate | null; reason: string | null } | null;
  /** they must accept the community's rules before posting (welcome screen) */
  needsRules?: boolean;
  /** show them the welcome screen */
  welcomePending?: boolean;
  /** what their community roles let them do (lib/roles): moderators who aren't admins see the matching tools */
  perms?: import("./roles").Permission[];
}

export interface CommunityCardDTO {
  id: Id;
  slug: string;
  name: string;
  /** made by Klique; the default "Klique" community everyone is in */
  official: boolean;
  /** a "Verified" check by its name (site admins give it) */
  verified: boolean;
  /** joining means answering its entry questions first */
  screening?: boolean;
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
  /** 18+ (private only), and allowing explicit content */
  adult: boolean;
  explicit: boolean;
  /** who it's for: everyone, or women or men only (always private; fixed when it's made) */
  audience: import("./constants").CommunityAudience;
  viewer: ViewerAccess;
}

/** what stands between the viewer and an 18+ community (server/policies/adult) */
export type AdultGate = "sign_in" | "under_18" | "dob_required" | "confirm_adult" | "explicit_optin";

export type GroupPolicy = "admins" | "members" | "off";

export interface CommunityDTO extends CommunityCardDTO {
  createdAt: ISODate;
  /** an 18+ community the viewer may not enter yet, and why (the page asks for it instead of showing anything) */
  ageGate: AdultGate | null;
  groupPolicy: GroupPolicy;
  /** the viewer may start a group here: they own the community */
  canCreateGroup: boolean;
  /** the viewer may post events in this community (its owner and admins) */
  canHostEvents: boolean;
  /** members may send events in for approval */
  memberEvents: boolean;
  /** members may use @everyone / @here (owners and admins always can) */
  membersMassMention?: boolean;
  /** you've muted @everyone and @here in this community */
  suppressEveryone?: boolean;
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

/** A community you can post to right now. */
export interface PostTargetDTO {
  slug: string;
  name: string;
  coverImage: string | null;
}

/** A post in a community's Posts section (Instagram style). */
export interface FeedPostDTO {
  id: Id;
  /** #tags in the caption, and the @people and @communities it names */
  tags?: string[];
  refs?: TextRefsDTO;
  community: { id: Id; slug: string; name: string; interest: InterestId; coverImage: string | null; privacy: CommunityPrivacy; explicit?: boolean; verified?: boolean };
  author: UserBrief;
  /** inside its community: the emoji of the author's highest role there that has one (on their picture) */
  roleBadge?: RoleBadge | null;
  caption: string;
  /** a text-only post's title ("" otherwise; lib/feedText) */
  title: string;
  /** a short text-only post's card background (lib/feedText), null otherwise */
  textBg: string | null;
  /** marked explicit (in a community that allows it): blurred until tapped */
  explicit: boolean;
  /** in reels: plain black behind a wider picture or video, not a blurred copy of it */
  plainBackdrop?: boolean;
  /** how a picture or video shows in the post's frame: cover (cropped to fill), black (whole, black bars), backdrop (whole, blurred copy behind) */
  mediaFit: "cover" | "black" | "backdrop";
  /** pictures, or one video; empty for a text post */
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
  /** the @people and @communities it names */
  refs?: TextRefsDTO;
  postId: Id;
  parentId: Id | null;
  /** empty when deleted */
  body: string;
  /** a built-in sticker id, or a saved picture sticker's link (null when deleted) */
  sticker: string | null;
  stickerUrl: string | null;
  deleted: boolean;
  createdAt: ISODate;
  editedAt: ISODate | null;
  author: UserBrief;
  /** inside its community: the emoji of the author's highest role there that has one (on their picture) */
  roleBadge?: RoleBadge | null;
  reactions: ReactionDTO[];
  canDelete: boolean;
  /** your own comment: you may change its text */
  canEdit: boolean;
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

/** A custom role in a community (lib/roles). */
export interface RoleDTO {
  id: Id;
  name: string;
  color: string | null;
  icon: string | null;
  /** higher = higher up */
  position: number;
  permissions: import("./roles").Permission[];
  selfAssignable: boolean;
  /** "admin": the built-in Admin role (what "admin" means; its permissions are fixed) */
  builtin: "admin" | null;
  memberCount?: number;
}

export interface MemberDTO {
  user: UserBrief;
  role: Role;
  joinedAt: ISODate;
  canChangeRole: boolean;
  canRemove: boolean;
  /** their custom roles, top first */
  roles?: Pick<RoleDTO, "id" | "name" | "color" | "icon">[];
  /** the emoji on their picture in this community: the owner's emoji, or their highest role's */
  roleBadge?: RoleBadge | null;
  /** you can change their roles */
  canEditRoles?: boolean;
  /** stopped from writing in Posts and on Boards, and whether you can change that */
  postBan?: { until: ISODate | null; reason: string | null } | null;
  canPostBan?: boolean;
  /** in a group: the title its owner gave them, what it lets them do, and whether you can change those */
  title?: string | null;
  powers?: import("./roles").GroupPower[];
  canEditMod?: boolean;
  /** owners and admins above them may time them out (or lift it) */
  canTimeout?: boolean;
  /** timed out until then (owners and admins see it) */
  timedOutUntil?: ISODate | null;
  timeoutReason?: string | null;
  /** their answers to the entry questions when they joined (owners and admins only) */
  answers?: EntryAnswer[];
}

/** Entry questions (membership screening): asked before someone joins a community. */
export interface ScreeningQuestion {
  id: string;
  /** a short answer, one of `options`, or an "I agree" box */
  kind: "text" | "choice" | "agree";
  prompt: string;
  options: string[];
  required: boolean;
}
export interface ScreeningDTO {
  enabled: boolean;
  questions: ScreeningQuestion[];
}
/** One answer, with what the question said when it was answered. */
export interface EntryAnswer {
  prompt: string;
  answer: string;
}

export type RequestStatus = "pending" | "approved" | "rejected";
export interface MembershipRequestDTO {
  id: Id;
  user: UserBrief;
  message: string;
  /** their answers to the entry questions */
  answers?: EntryAnswer[];
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
  /** its community's owner pinned it: first on the community's events */
  pinned?: boolean;
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
  /** the name the host gave that button; none is "Get tickets" */
  ticketLabel: string | null;
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
  community: { slug: string; name: string; privacy: CommunityPrivacy; official?: boolean; adult?: boolean; verified?: boolean } | null;
  subcommunity: { slug: string; name: string } | null;
  audience: EventAudience;
  goingCount: number;
  interestedCount: number;
  /** crews heading there together */
  crewCount: number;
  isPast: boolean;
  isFull: boolean;
  /** `mustJoin`: a community's event the viewer isn't a member of: going or saving it means joining first */
  viewer: { rsvp: RsvpStatus | null; saved: boolean; isHost: boolean; /** the community's owner (or a site admin): may pin it */
    canPin?: boolean;
    canEdit: boolean; mustJoin?: boolean; canReview?: boolean; canManageMoney?: boolean };
  /** a member's event not approved yet: waiting for the space's owner or an admin, or turned down (with why) */
  review: { status: "pending" | "rejected"; reason: string } | null;
  /** chipping in toward it (lib/money): so much a unit; what's been raised; the viewer's units; paid out yet */
  contribution: EventContributionDTO | null;
}

/* ------------------------------ kliques ------------------------------ */
/* (called crews before Nov 2026: the code keeps the Crew names; people only ever see "klique") */

export type CrewJoinMode = "open" | "approval";
/** where the viewer stands with a klique */
export type CrewStanding = "host" | "member" | "pending" | null;

/** A klique in a list: enough to decide whether to join. The exact meetup point stays hidden until you're in. */
export interface CrewCardDTO {
  id: Id;
  /** going to this event together; null for a community klique */
  eventId: Id | null;
  /** the hook line: "Who wants to watch Dune at Filmhouse Lekki on Saturday?" */
  title: string;
  interest: InterestId;
  coverImage: string | null;
  womenOnly: boolean;
  /** who can join (mixed: `womenSpots` for women, `menSpots` for men, the rest anyone) */
  audience: "everyone" | "women" | "men" | "mixed";
  womenSpots: number;
  menSpots: number;
  /** spots still open, by who can take them (mixed kliques; otherwise all in `any`) */
  left: { women: number; men: number; any: number };
  /** the event it's for (null for a community klique) */
  event: { id: Id; title: string; startsAt: ISODate } | null;
  /** the community it belongs to (the event's, for an event klique), if any */
  community: { slug: string; name: string; verified?: boolean } | null;
  city: CityId;
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

/** A klique you're in (or asked to join), for the community's left panel. */
export interface MyCrewDTO {
  id: Id;
  title: string;
  area: string;
  eventId: Id | null;
  eventTitle: string | null;
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
  event: { id: Id; title: string; startsAt: ISODate; endsAt: ISODate | null; venue: string; online: boolean; coverImage: string | null; city: CityId; country: string } | null;
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

/** One line of a community's moderation log: who removed whose what, and when. */
export interface ModLogEntryDTO {
  id: Id;
  action: string;
  /** feedPost, topic, channelMessage, event, klique, kliqueMessage */
  targetType: string;
  label: string;
  actor: UserBrief | null;
  author: UserBrief | null;
  createdAt: ISODate;
}

/** Who and what a post's or comment's text names (@people, @communities), resolved when it was written. */
export interface TextRefsDTO {
  users: MentionDTO[];
  communities: { slug: string; name: string; verified: boolean }[];
}

/** Search inside a community: what kind of thing a result is. */
export type SearchKind = "message" | "topic" | "post" | "event" | "klique" | "member";
export interface SearchHitDTO {
  kind: SearchKind;
  id: Id;
  /** the channel ("#general"), the board post's or event's title, the person's name */
  title: string;
  /** the text around the match */
  snippet: string;
  author: UserBrief | null;
  at: ISODate | "";
  /** where "Jump" goes (a chat message opens its channel at that message) */
  href: string;
  image?: string | null;
  pinned?: boolean;
}
export interface CommunitySearchDTO {
  /** the free text searched (filters taken out) */
  query: string;
  /** the filters understood, as chips: "from:@tobi", "has:image"… */
  filters: string[];
  counts: Record<SearchKind, number>;
  /** a few of each kind, or a page of one kind (`type`) */
  hits: SearchHitDTO[];
  hasMore: boolean;
  page: number;
  type: SearchKind | null;
  sort: "relevance" | "newest";
}

/** Your plan (lib/plans): Free, Lite or Pro, and how much of its limits you've used. */
export interface SubscriptionDTO {
  plan: "free" | "lite" | "pro";
  /** a paid plan's last day (null on Free) */
  until: ISODate | null;
  /** "active" renews; "non_renewing" was cancelled (lasts to `until`); "attention": a renewal failed */
  status: "active" | "non_renewing" | "attention" | "ended" | null;
  /** paid on Paystack, or free time (leftover Hype, an admin's gift) */
  source: "paystack" | "hype" | "grant" | "store" | null;
  /** it renews by itself next month (so it can be cancelled) */
  renews: boolean;
  /** site admins have everything free */
  siteAdmin: boolean;
  /** Paystack is set up, so plans can be bought */
  canBuy: boolean;
  /** buying in the phone app: the store products, and what ties a purchase to this person */
  store: { apple: boolean; google: boolean; products: Record<"lite" | "pro", string>; accountToken: string };
  config: import("./plans").PlanConfig;
  /** kliques started this month, and kliques you're in now (not hosting) */
  usage: { started: number; inNow: number };
}

/** Kliques to join: "Kliques for you" on Home, and /kliques (with filters). */
export interface KliqueListDTO {
  items: CrewCardDTO[];
  hasMore: boolean;
}

/** A klique in your Joined list: its chat's unread count and last message (none while you're only asking to join). */
export interface JoinedKliqueDTO extends CrewCardDTO {
  unreadCount: number;
  lastMessage: { author: string; mine: boolean; text: string; at: ISODate } | null;
}

/** What starting a klique needs to know: where you may start one, and the form's options. */
export interface KliqueStartDTO {
  /** you may offer "Women only" (your profile says woman) */
  canWomenOnly: boolean;
  /** you may offer "Men only" (your profile says man) */
  canMenOnly: boolean;
  /** why you can't start one at all (age, email, plan limit…), in words */
  blockedReason: string | null;
  /** communities you're in, for a community klique */
  communities: { slug: string; name: string; interest: InterestId }[];
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
  /** the community to join first, when that's what stands between you and its kliques */
  joinSpace?: { slug: string; sub: string | null; name: string; ask: boolean; requested: boolean } | null;
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
  /** pass as `after` for the next people; null when there are no more */
  nextCursor: string | null;
  /** up to 3 of the viewer's friends who are going and show it, on the first page only */
  friends?: UserBrief[];
  /** how many friends in all */
  friendCount?: number;
}

/* ---------------------------- discovery ----------------------------- */

export interface DiscoverDTO {
  /** every event on this page in one mixed order, different per person and over time: Home shows them in this order */
  eventsForYou: EventDTO[];
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

/** What can narrow a search; leave anything out for "any". */
export interface SearchFilters {
  where?: string;
  type?: "all" | "communities" | "events" | "people";
  interest?: string;
  when?: string;
  price?: "any" | "free" | "paid";
  format?: "any" | "in-person" | "online";
  past?: boolean;
  verified?: boolean;
  sort?: "best" | "new" | "popular";
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
  /** in a group: who sent it */
  sender?: UserBrief;
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
  /** you pinned it to the top */
  pinned?: boolean;
  id: Id;
  /** who it's with. In a group, `other` stands for the group: its name, with no profile behind it */
  other: UserBrief;
  /** a group of friends */
  group?: { memberCount: number; mine: boolean } | null;
  lastMessage: { body: string; sticker?: string | null; senderId: Id; createdAt: ISODate; mine: boolean } | null;
  unreadCount: number;
  updatedAt: ISODate;
  /** true when the viewer blocked the other person (never reveals the reverse) */
  blockedByMe: boolean;
  /** a message request waiting to be accepted: sent by you (`fromMe`) or to you */
  request?: { fromMe: boolean } | null;
}

/** Who's in a group of friends. */
export interface ChatGroupDTO {
  id: Id;
  name: string;
  /** you started it: you add and remove people */
  mine: boolean;
  members: { user: UserBrief; owner: boolean; me: boolean }[];
}

export interface ConversationDetailDTO {
  conversation: ConversationDTO;
  messages: MessageDTO[];
  hasMore: boolean;
  canSend: boolean;
  cannotSendReason?: string;
}

/* ------------------------------ safety ------------------------------ */

export type ReportTargetType = "user" | "post" | "event" | "community" | "subcommunity" | "message" | "channelMessage" | "ad" | "feedPost" | "klique";

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

/** a role's allow / deny on a channel or category (custom roles; null = as usual) */
export interface RoleOverrideDTO {
  roleId: Id;
  view: "allow" | "deny" | null;
  post: "allow" | "deny" | null;
}

/** A thread in a channel's thread list. */
export interface ThreadDTO {
  slug: string;
  name: string;
  count: number;
  lastAt: ISODate | null;
  createdAt: ISODate;
  /** no replies for 7 days (a new reply opens it again) */
  archived: boolean;
  startedBy: UserBrief | null;
  /** the message it hangs off, and who replied last */
  startMessageId: Id;
  lastBy: string | null;
}

export interface ChannelCategoryDTO {
  id: Id;
  name: string;
  position: number;
  /** role overrides for its channels (people who manage channels see them) */
  overrides?: RoleOverrideDTO[];
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
  /** you muted it */
  muted?: boolean;
  canPost: boolean;
  /** you're timed out in this community until then (you can read, not post) */
  timedOutUntil?: ISODate | null;
  /** role overrides on this channel (people who manage channels see them) */
  overrides?: RoleOverrideDTO[];
  /** they must accept the community's rules before they can post */
  needsRules?: boolean;
  /** this is a thread off a message in another channel */
  thread?: { parentSlug: string; parentName: string; startMessageId: Id; archived: boolean };
  /** unread messages that tag the viewer (capped at 99) */
  mentions: number;
  /** guest-list size, for private channels (owners/admins only) */
  memberCount?: number;
  /** slow mode: seconds each person waits between messages (0 = off) */
  slowModeSec: number;
  /** the viewer doesn't wait (owners, admins, site admins) */
  slowModeExempt: boolean;
  /** may use @everyone / @here here (Discord's "Mention @everyone, @here and all roles") */
  canMassMention?: boolean;
  /** about how many people can see it (for "This will notify N people") */
  audience?: number;
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
  /** you pinned it to the top */
  pinned?: boolean;
  id: Id;
  slug: string;
  name: string;
  interest: InterestId;
  coverImage: string | null;
  privacy: CommunityPrivacy;
  /** a "Verified" check by its name */
  verified?: boolean;
  role: Role;
  unread: boolean;
  /** unread messages across its channels you can see, and your crews' chats there (capped at 99) */
  unreadCount: number;
  mentions: number;
  /** you muted it */
  muted?: boolean;
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
  /** pinged @everyone or @here (it highlights for everyone who could see it) */
  massMention?: "everyone" | "here" | null;
  /** a poll posted with this message (load it with PollService) */
  pollId?: Id | null;
  /** posted by a channel webhook (a bot): `author` is its name and picture, with no profile behind it */
  bot?: boolean;
  /** cards a bot or webhook posted (the message may have no text then) */
  cards?: MessageCard[];
  /** the author's name colour here (their highest coloured role) */
  color?: string | null;
  /** the emoji of the author's highest role here that has one (on their picture) */
  roleBadge?: RoleBadge | null;
  /** a thread started from this message */
  thread?: { slug: string; name: string; count: number; lastAt: ISODate | null; lastBy?: string | null };
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
  /** its width ÷ height, saved with a post so it always shows at the same height (none on older posts) */
  aspect?: number | null;
  /** the frame the poster picked for their post (on its first picture); none follows `aspect` */
  frame?: number | null;
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
  /** posts here you wrote, follow or replied in, newest activity first (at most 5); shown under the board in the sidebar */
  mine?: BoardPostDTO[];
}

/** One of your posts under its board in the sidebar. */
export interface BoardPostDTO {
  id: Id;
  title: string;
  /** replies by others you haven't read (capped at 99) */
  unread: number;
}

/** What the desktop sidebar beside a board shows (refreshed live as people post and comment). */
/** One profile effect people can unlock with Hype (uploaded by a site admin). */
export interface ProfileEffectDTO {
  /** its slug: what a profile stores */
  id: string;
  name: string;
  /** "lottie": a Lottie JSON ("image", an animated WebP or APNG, only on effects added before they became Lottie only) */
  kind: "image" | "lottie";
  fileUrl: string;
  /** where a Lottie pauses when it isn't playing, 0 (start) to 1 (end) */
  posterFrame: number;
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
  /** "gifts": one person's gift earnings (no community) */
  kind: "community" | "gifts";
  /** gifts: the day it's due (the 3rd of the month after the request) */
  dueOn: ISODate | null;
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

/**
 * How a community is doing, by its owner's plan: Lite sees who's active and how the week went; Pro also sees the best
 * times to post, the last 30 days of chat and its most active members. `tier: "none"`: the owner is on Free.
 */
export interface GrowthStatsDTO {
  tier: "none" | "lite" | "pro";
  /** people who wrote in chat in the last 30 days */
  activeMembers: number;
  /** of everyone in it, in percent */
  activeShare: number;
  messages7: number;
  messagesLast7: number;
  /** most messages in the last 30 days */
  topChannels: { name: string; messages: number }[];
  /** Pro */
  messagesPerDay?: { day: string; count: number }[];
  /** the busiest hours of the day, Lagos time (0-23), busiest first */
  bestHours?: { hour: number; messages: number }[];
  /** the busiest days of the week (0 = Sunday), busiest first */
  bestDays?: { day: number; messages: number }[];
  topMembers?: { user: UserBrief; messages: number }[];
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

/** active: the post with the newest comment first (a new comment bumps it up) */
export type TopicSort = "active" | "hot" | "new" | "top";

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
  kind: "avatar" | "photo" | "video" | "effect" | "emoji";
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
  | { type: "notify"; category: string; ref: string | null; inbox: boolean; /** what to show, for people who get pushes for this: the desktop app shows it itself, having no browser push */ alert?: { title: string; body: string; href: string } }
  /** something changed in a crew you're in (someone joined or left, a new chat message…) */
  | { type: "crew"; crewId: Id; chat?: boolean }
  /** your saved stickers changed (on another device, or this one) */
  | { type: "stickers" }
  /** the connection came back after a gap: refetch whatever is on screen */
  | { type: "resync" }
  /** someone started (`on`) or stopped typing in a chat (`where`: see TypingDTO) */
  | { type: "typing"; where: string; user: { id: Id; name: string }; on: boolean };

/** A chat to type in: a community or group channel, a DM conversation, or a crew's chat. */
export type TypingTarget = { kind: "channel"; slug: string; sub?: string | null; channel: string } | { kind: "dm"; id: Id } | { kind: "crew"; id: Id };

/** Who's typing in a chat right now (never you). `where` names the chat in "typing" live events. */
export interface TypingDTO {
  where: string;
  typing: { id: Id; name: string }[];
}

export interface RealtimeTokenDTO {
  /** pass to Ably's auth callback as-is */
  tokenRequest: Record<string, unknown>;
  /** the channels this person may listen on */
  channels: string[];
}

/** What the sign-in pages need to know about this server. */
export interface AuthConfigDTO {
  /** the phone app's Google sign-in asks for tokens for this; a public id, not a secret */
  googleClientId: string | null;
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
  /** 2: involves a minor or isn't consensual (hidden at once); 1: from an 18+ community; 0: the rest */
  priority: number;
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
  gender: "woman" | "man" | "unspecified";
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
  /** communities waiting to be checked for the Verified badge */
  pendingVerification: number;
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
  /** active: posted, commented or sent a message in the 7 days (and the 7 before) */
  people: { total: number; new7d: number; newPrev7d: number; suspended: number; unverified: number; active7d: number; activePrev7d: number };
  events: { upcoming: number; thisWeek: number; created7d: number; imported: number };
  communities: { total: number; new7d: number; large: number };
  /** what's waiting on an admin (urgent: reports about a minor or other priority-2 reasons) */
  queue: { openReports: number; urgentReports: number; pendingDrafts: number; pendingAds: number; pendingPayouts: number };
  /** this month so far, in naira, and last month up to the same point */
  revenue: { hype: number; ads: number; fees: number; total: number; prevTotal: number };
  /** how many days the series covers (7, 30 or 90) */
  days: number;
  /** per day, oldest first (YYYY-MM-DD, UTC): sign-ups, feed posts, and messages (community chat and DMs) */
  series: { day: string; signups: number; posts: number; messages: number }[];
  /** Home style, from devices seen in the last 30 days: people on each (someone on both counts in both), and per device kind */
  homeStyles: { casual: number; communities: number; byPlatform: { platform: "phone" | "site" | "desktop"; casual: number; communities: number }[] };
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

/** Where a community stands on the Verified check (its owner sees this). */
export interface VerificationDTO {
  state: "none" | "pending" | "rejected" | "verified";
  requestedAt: ISODate | null;
  /** why it was turned down, when a site admin said */
  note: string | null;
  /** what it asks for, and whether each is met */
  checks: { id: "plan" | "members" | "content"; label: string; met: boolean }[];
  canApply: boolean;
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
  /** 18+, and allowing explicit content */
  adult: boolean;
  explicit: boolean;
  /** has the "Verified" check (Klique HQ always) */
  verified: boolean;
  official: boolean;
  /** its owner applied to be verified, and is waiting */
  verificationPending: boolean;
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
  /** event news about an event that's over by now ("ended") or called off ("cancelled"): no Going any more */
  eventOver?: "ended" | "cancelled";
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
  /** an event's ad: the interests it targets */
  interests: string[];
  reach: "city" | "country" | "world";
  place: string | null;
  placeLabel: string;
  days: number;
  startOn: ISODate | null;
  amount: number;
  currency: string;
  reviewNote: string;
  paymentMethod: "paystack" | "manual" | "apple" | "google" | null;
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
  /** paying in the phone app: the store product to buy (null when the price is above every tier), what it costs, and what ties the purchase to this ad */
  store: { productId: string | null; amount: number | null; accountToken: string; apple: boolean; google: boolean };
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
  interests?: string[];
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

/* ------------------------------- gifts ------------------------------- */

/** A gift in the catalogue (lib/gifts.ts). `price` is naira, `hype` what it costs (₦10 a Hype). */
export interface GiftDTO {
  id: Id;
  slug: string;
  name: string;
  emoji: string;
  artUrl: string | null;
  price: number;
  hype: number;
  /** admins only */
  active?: boolean;
  position?: number;
}

/** The gift tray: the catalogue and your balance. */
export interface GiftTrayDTO {
  gifts: GiftDTO[];
  balance: number;
  enabled: boolean;
  hypeNaira: number;
}

/** The gifts on one post, comment, board post or board reply: one line per kind, most valuable first (never who). */
export interface GiftSummaryDTO {
  total: number;
  items: { giftId: Id; name: string; emoji: string; artUrl: string | null; count: number; price: number }[];
}

export interface HypeEntryDTO {
  id: Id;
  amount: number;
  balanceAfter: number;
  kind: "topup" | "gift" | "grant" | "revoke" | "refund";
  note: string;
  createdAt: ISODate;
}

/** Your Hype for gifts: the balance, ways to top up (Paystack on the web, Apple or Google in the app), and history. */
export interface GiftWalletDTO {
  balance: number;
  hypeNaira: number;
  webPacks: { naira: number; hype: number }[];
  customMin: number;
  customMax: number;
  canBuyWeb: boolean;
  store: { apple: boolean; google: boolean; accountToken: string; packs: { productId: string; hype: number; price: number }[] };
  history: HypeEntryDTO[];
  hasMore: boolean;
}

/** A gift you got (or sent). `from` is null on an anonymous gift you didn't send: show "Someone". */
export interface GiftReceivedDTO {
  id: Id;
  giftName: string;
  emoji: string;
  artUrl: string | null;
  price: number;
  hype: number;
  /** naira the receiver earns */
  earned: number;
  anonymous: boolean;
  from: UserBrief | null;
  target: { type: "post" | "comment" | "topic" | "reply"; id: Id };
  createdAt: ISODate;
  holdUntil: ISODate;
  paidOut: boolean;
}
export interface GiftSentDTO extends GiftReceivedDTO {
  to: UserBrief;
}

/** Settings → Earnings. */
export interface GiftEarningsDTO {
  receiverPercent: number;
  holdDays: number;
  minPayout: number;
  totals: { earned: number; onHold: number; available: number; requested: number; paid: number };
  /** when the waiting request (or the next one) is paid: the 3rd of the month after it's made */
  nextPayoutOn: ISODate;
  waiting: PayoutDTO | null;
  payouts: PayoutDTO[];
  history: GiftReceivedDTO[];
  hasMore: boolean;
  bank: { bankName: string; accountName: string; accountNumber: string; bankCode: string } | null;
  canRequest: boolean;
}

/** Admin → Gifts dashboard. Naira throughout. */
/** A Hype top-up that may be paid without its Hype yet (Admin → Gifts). */
export interface AdminStuckTopupDTO {
  id: string;
  reference: string;
  platform: "web" | "apple" | "google";
  hype: number;
  amount: number;
  /** uncredited: paid, but its Hype never landed; unconfirmed: a store purchase, confirmed by the store, not yet credited */
  kind: "unconfirmed" | "uncredited";
  createdAt: string;
  user: { handle: string; displayName: string } | null;
}

export interface AdminGiftsReportDTO {
  bought: {
    total: { amount: number; count: number; hype: number; storeFees: number };
    byPlatform: { platform: "web" | "apple" | "google"; amount: number; fees: number; count: number; hype: number }[];
    series: { period: string; amount: number; count: number }[];
  };
  purchases: { id: Id; user: UserBrief; platform: "web" | "apple" | "google"; pack: string; hype: number; amount: number; storeFee: number; reference: string; test: boolean; paidAt: ISODate }[];
  sends: { id: Id; from: UserBrief; to: UserBrief; anonymous: boolean; gift: { name: string; emoji: string }; price: number; receiverAmount: number; kliqueAmount: number; target: { type: "post" | "comment" | "topic" | "reply"; id: Id }; community: { slug: string; name: string } | null; createdAt: ISODate }[];
  split: { giftValue: number; count: number; klique: number; receivers: number; receiversPaid: number; receiversRequested: number; receiversOwed: number };
}
