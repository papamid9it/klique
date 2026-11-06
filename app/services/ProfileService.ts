import type { SocialId } from "@/lib/socials";
import ApiClient from "@/app/ApiCore";
import type { CityId, DmPolicy, InterestId, Presence, ProfileVisibility } from "@/lib/constants";
import type { MoodPref } from "@/lib/moods";
import type { Envelope, EventDTO, Paginated, ProfileView, UserBrief, UserMe, TopicMediaDTO } from "@/lib/types";

const api = new ApiClient();

export interface ProfileUpdate {
  socials?: { platform: SocialId; handle: string }[];
  /** "YYYY-MM-DD": set once (after that only Klique support can change it) */
  dob?: string;
  displayName?: string;
  bio?: string;
  pronouns?: string;
  gender?: "woman" | "man" | "unspecified";
  presence?: Presence;
  country?: string;
  region?: string;
  city?: CityId;
  neighborhood?: string;
  interests?: InterestId[];
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bannerColor?: string | null;
  avatarFrame?: string | null;
  nameEffect?: string | null;
  profileTheme?: { primary: string; accent: string } | null;
  profileEffect?: string | null;
  mood?: MoodPref;
  profileVisibility?: ProfileVisibility;
  attendancePublic?: boolean;
  createdCommunitiesPublic?: boolean;
  communityReachPublic?: boolean;
  dmPolicy?: DmPolicy;
}

export const ProfileService = {
  me: () => api.get<Envelope<UserMe>>("/api/me"),
  updateMe: (patch: ProfileUpdate) => api.patch<Envelope<UserMe>>("/api/me", patch),
  /** your profile photos and videos, in order (the whole list) */
  setMedia: (items: TopicMediaDTO[]) => api.put<Envelope<UserMe>>("/api/me/media", { items }),
  /** "I'm 18 or older", once, before first entering an 18+ community */
  confirmAdult: () => api.post<Envelope<UserMe>>("/api/me/adult"),
  /** Show explicit content: on needs `agree` (and an 18+ date of birth); the phone app can only turn it off */
  setExplicit: (on: boolean, agree?: boolean) => api.put<Envelope<UserMe>>("/api/me/explicit", { on, agree }),
  /** Communities you still own (they block deleting your account). */
  deleteCheck: () => api.get<Envelope<{ ownedCommunities: { slug: string; name: string }[] }>>("/api/me/delete"),
  /** Permanently delete your account; signs you out. */
  deleteAccount: (input: { password?: string; confirm: string }) => api.post<Envelope<{ signedOut: boolean }>>("/api/me/delete", input),
  get: (handle: string) => api.get<Envelope<ProfileView>>(`/api/people/${encodeURIComponent(handle)}`, undefined, { ttl: 30 }),
  /** "See all" on a profile */
  events: (handle: string, kind: "going" | "hosting") => api.get<Envelope<EventDTO[]>>(`/api/people/${encodeURIComponent(handle)}/events`, { kind }),
  people: (params: { where?: string; interest?: InterestId; q?: string; page?: number } = {}) =>
    api.get<Envelope<Paginated<UserBrief>>>("/api/people", params),
};
