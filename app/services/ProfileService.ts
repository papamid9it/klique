import ApiClient from "@/app/ApiCore";
import type { CityId, DmPolicy, InterestId, Presence, ProfileVisibility } from "@/lib/constants";
import type { MoodId } from "@/lib/moods";
import type { Envelope, Paginated, ProfileView, UserBrief, UserMe } from "@/lib/types";

const api = new ApiClient();

export interface ProfileUpdate {
  /** "YYYY-MM-DD": set once (after that only Klique support can change it) */
  dob?: string;
  displayName?: string;
  bio?: string;
  pronouns?: string;
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
  mood?: MoodId;
  profileVisibility?: ProfileVisibility;
  attendancePublic?: boolean;
  dmPolicy?: DmPolicy;
}

export const ProfileService = {
  me: () => api.get<Envelope<UserMe>>("/api/me"),
  updateMe: (patch: ProfileUpdate) => api.patch<Envelope<UserMe>>("/api/me", patch),
  /** "I'm 18 or older", once, before first entering an 18+ community */
  confirmAdult: () => api.post<Envelope<UserMe>>("/api/me/adult"),
  /** Show explicit content: on needs `agree` (and an 18+ date of birth); the phone app can only turn it off */
  setExplicit: (on: boolean, agree?: boolean) => api.put<Envelope<UserMe>>("/api/me/explicit", { on, agree }),
  /** Communities you still own (they block deleting your account). */
  deleteCheck: () => api.get<Envelope<{ ownedCommunities: { slug: string; name: string }[] }>>("/api/me/delete"),
  /** Permanently delete your account; signs you out. */
  deleteAccount: (input: { password?: string; confirm: string }) => api.post<Envelope<{ signedOut: boolean }>>("/api/me/delete", input),
  get: (handle: string) => api.get<Envelope<ProfileView>>(`/api/people/${encodeURIComponent(handle)}`, undefined, { ttl: 30 }),
  people: (params: { where?: string; interest?: InterestId; q?: string; page?: number } = {}) =>
    api.get<Envelope<Paginated<UserBrief>>>("/api/people", params),
};
