/**
 * Seeds realistic Lagos + Abuja sample data so the app looks populated on first run.
 *
 *   npm run seed          # seed once (skips if demo data already exists)
 *   npm run seed:reset    # wipe ALL klique collections, then seed fresh
 *
 * Event dates are relative to "now", so there are always upcoming events.
 * Demo accounts all share one password (SEED_DEMO_PASSWORD, default below) —
 * it exists only for local development. Never run this against production.
 */
import { config } from "dotenv";
import mongoose, { type Types } from "mongoose";

config({ path: ".env.local" });
config();

import { startOfLagosDay } from "../lib/dates";
import type { CityId, InterestId } from "../lib/constants";
import { currencyOf, getCityEntry } from "../lib/places";
import { hashPassword } from "../server/auth/password";
import { Channel, ChannelCategory, ChannelMember, ChannelMessage, ChannelRead, ensureChannelIndexes } from "../server/models/Channel";
import { Friendship, pairKeyOf } from "../server/models/Friendship";
import { Reaction } from "../server/models/Reaction";
import { LinkPreview } from "../server/models/LinkPreview";
import { Community } from "../server/models/Community";
import { Conversation, participantKey } from "../server/models/Conversation";
import { Event } from "../server/models/Event";
import { Invitation } from "../server/models/Invitation";
import { Membership } from "../server/models/Membership";
import { MembershipRequest } from "../server/models/MembershipRequest";
import { Message } from "../server/models/Message";
import { Post } from "../server/models/Post";
import { Board, Topic, TopicComment, TopicLike } from "../server/models/Topic";
import { Rsvp, SavedEvent } from "../server/models/Rsvp";
import { Block, Report } from "../server/models/Safety";
import { Subcommunity } from "../server/models/Subcommunity";
import { User } from "../server/models/User";
import { ensureDefaultChannels, ensureDefaultGroupChannels } from "../server/services/channels.service";
import { recountMembers, recountRsvps } from "../server/services/helpers";

/** country + state + city for a seed row (the state comes from the gazetteer). */
const placeOf = (country: string | undefined, city: string) => {
  const cc = country ?? "NG";
  return { country: cc, region: getCityEntry(cc, city)?.region ?? "", city };
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "klique-demo-1234";

/** A moment `days` from today at `hour` (24h, Lagos time). */
const at = (days: number, hour: number, minute = 0) =>
  new Date(startOfLagosDay(new Date()).getTime() + days * DAY + hour * HOUR + minute * 60_000);

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

interface SeedUser {
  handle: string;
  name: string;
  country?: string;
  city: CityId;
  hood: string;
  bio: string;
  interests: InterestId[];
  attendancePublic?: boolean;
  profileVisibility?: "public" | "members" | "private";
  dmPolicy?: "everyone" | "shared" | "nobody";
}

const USERS: SeedUser[] = [
  { handle: "tobi", name: "Tobi Adeyemi", city: "lagos", hood: "Yaba", bio: "Skates Freedom Park on Sundays. Shoots film. Always late.", interests: ["skate", "photography", "music"], dmPolicy: "everyone" },
  { handle: "amara", name: "Amara Okafor", city: "lagos", hood: "Lekki Phase 1", bio: "Alté head, part-time stylist. Ask me about thrift runs.", interests: ["music", "streetwear", "art"], dmPolicy: "everyone" },
  { handle: "kunle", name: "Kunle Bakare", city: "lagos", hood: "Surulere", bio: "Pushing since 2014. Teaches beginners on Saturdays.", interests: ["skate", "film"], dmPolicy: "shared" },
  { handle: "zainab", name: "Zainab Musa", city: "abuja", hood: "Wuse 2", bio: "Photo walks around the city. Golden hour or nothing.", interests: ["photography", "art", "running"], dmPolicy: "everyone" },
  { handle: "chidi", name: "Chidi Nwosu", city: "lagos", hood: "Ikeja", bio: "Sub-50 10K chaser. Pace group captain.", interests: ["running", "dance"], attendancePublic: false, dmPolicy: "shared" },
  { handle: "folake", name: "Folake Williams", city: "lagos", hood: "Victoria Island", bio: "Curator. Painting on weekends, gallery hopping on weeknights.", interests: ["art", "photography", "film"], dmPolicy: "everyone" },
  { handle: "emeka", name: "Emeka Obi", city: "abuja", hood: "Maitama", bio: "Digging for records and low-key gigs.", interests: ["music", "streetwear"], dmPolicy: "nobody" },
  { handle: "ngozi", name: "Ngozi Eze", city: "lagos", hood: "Ikoyi", bio: "Runs a small studio. Bad at small talk, good at critique.", interests: ["art", "streetwear"], profileVisibility: "members", dmPolicy: "shared" },
  { handle: "sade", name: "Sade Balogun", city: "lagos", hood: "Lagos Island", bio: "Dancer first. Afrobeats, amapiano, whatever moves.", interests: ["dance", "music"], dmPolicy: "everyone" },
  { handle: "yusuf", name: "Yusuf Ibrahim", city: "abuja", hood: "Jabi", bio: "Learning to ollie at 29. No shame.", interests: ["skate", "running"], dmPolicy: "everyone" },
  { handle: "dami", name: "Damilola Ade", city: "lagos", hood: "Maryland", bio: "Film nerd. 16mm on a budget.", interests: ["film", "photography"], dmPolicy: "everyone" },
  { handle: "ife", name: "Ife Johnson", city: "lagos", hood: "Ajah", bio: "Early-morning runner, late-night listener.", interests: ["running", "music"], profileVisibility: "private", dmPolicy: "nobody" },
  { handle: "kwame", name: "Kwame Mensah", country: "GH", city: "accra", hood: "East Legon", bio: "Highlife on vinyl, jollof on Sundays. Accra born.", interests: ["music", "dance"], dmPolicy: "everyone" },
  { handle: "efua", name: "Efua Asante", country: "GH", city: "kumasi", hood: "", bio: "Street photographer between Kumasi and Accra.", interests: ["photography", "art"], dmPolicy: "everyone" },
  { handle: "wanjiru", name: "Wanjiru Kamau", country: "KE", city: "nairobi", hood: "Kilimani", bio: "Runs the Karura long-run crew. Coffee after.", interests: ["running", "music"], dmPolicy: "everyone" },
  { handle: "otieno", name: "Otieno Odhiambo", country: "KE", city: "nairobi", hood: "Westlands", bio: "Painter and gallery hopper.", interests: ["art", "film"], dmPolicy: "everyone" },
  { handle: "thabo", name: "Thabo Nkosi", country: "ZA", city: "cape-town", hood: "Woodstock", bio: "Skate shop kid. Woodstock is home.", interests: ["skate", "streetwear"], dmPolicy: "everyone" },
  { handle: "lerato", name: "Lerato Dlamini", country: "ZA", city: "johannesburg", hood: "Maboneng", bio: "Amapiano, sneakers and Sunday markets.", interests: ["streetwear", "music", "dance"], dmPolicy: "everyone" },
  { handle: "zara", name: "Zara Okoye", country: "GB", city: "london", hood: "Peckham", bio: "Promoter. Afrobeats nights across South London.", interests: ["music", "film"], dmPolicy: "everyone" },
];

/* ------------------------------------------------------------------ */
/* Communities, groups, posts, chat                                    */
/* ------------------------------------------------------------------ */

interface SeedGroup {
  key: string;
  name: string;
  description: string;
  visibility: "parent" | "private";
  owner: string;
  members: string[];
}

interface SeedCommunity {
  key: string;
  name: string;
  description: string;
  interest: InterestId;
  country?: string;
  city: CityId;
  hood: string;
  privacy: "public" | "private";
  owner: string;
  admins?: string[];
  members: string[];
  groups?: SeedGroup[];
  posts: { by: string; body: string; ago: number; pinned?: boolean }[];
  /** days ago the community was created */
  age: number;
}

const CHATTER = [
  "Who's around this weekend?",
  "Just got back, that session was unreal.",
  "Anyone have a spare set of bearings? Mine are finished.",
  "Count me in for Saturday.",
  "Road is smooth near the roundabout now, they finally fixed it.",
  "Dropping the clip in a minute, the light was perfect.",
  "Is the meetup still on if it rains?",
  "Yes, we move under the bridge. It's dry there.",
  "Welcome to the new people! Say hi 👋",
  "Bring water. Seriously, it's hot out.",
  "Can someone share the location pin again?",
  "Pinned it in announcements.",
  "That was a clean run, well done.",
  "Anyone going to the event on Friday? https://klique.ng/events",
  "Thanks for the tips yesterday, really helped.",
  "I'll be 15 minutes late, start without me.",
  "New here, where do beginners start?",
  "Check the Beginner sessions group, they're very patient.",
  "Great turnout today!",
  "Same time next week?",
];

const COMMUNITIES: SeedCommunity[] = [
  {
    key: "waf",
    name: "WAF Skate Crew",
    description:
      "Lagos skateboarding, every Sunday at Freedom Park and wherever the concrete is smooth. All levels welcome — bring a board or borrow one. We film, we film-photo, we push.",
    interest: "skate",
    city: "lagos",
    hood: "Lagos Island",
    privacy: "public",
    owner: "kunle",
    admins: ["tobi"],
    members: ["tobi", "amara", "kunle", "dami", "yusuf", "folake", "sade"],
    age: 320,
    groups: [
      { key: "waf-beginners", name: "Beginner sessions", description: "Never stepped on a board? Start here. Slow, patient, spare boards and pads on hand.", visibility: "private", owner: "kunle", members: ["kunle", "tobi", "amara", "dami"] },
      { key: "waf-filmers", name: "Filmers & photographers", description: "Who's filming Sunday's session? Share clips, gear tips and shoot days.", visibility: "private", owner: "tobi", members: ["tobi", "dami", "folake"] },
      { key: "waf-night", name: "Night riders", description: "Invite-only late sessions. Locations shared in the group.", visibility: "private", owner: "kunle", members: ["kunle", "tobi"] },
    ],
    posts: [
      { by: "kunle", body: "Sunday session is ON. Freedom Park, 4pm. Smooth concrete after the weekend clean-up. Beginners — come early, we'll set you up.", ago: 1, pinned: true },
      { by: "tobi", body: "Dropped the clips from last week's session in the filmers group. Someone finally landed the kickflip down the three-stair 🎉", ago: 3 },
      { by: "amara", body: "Anyone got a spare set of 52mm wheels? Mine are flat-spotted beyond saving.", ago: 5 },
    ],
  },
  {
    key: "alte",
    name: "Lagos Alté Archive",
    description:
      "A living archive of Lagos alté and indie — tapes, tracks, flyers, and the nights that made them. Listening sessions, record swaps and the occasional rooftop set.",
    interest: "music",
    city: "lagos",
    hood: "Lekki Phase 1",
    privacy: "public",
    owner: "amara",
    admins: ["sade"],
    members: ["amara", "sade", "tobi", "emeka", "folake", "ngozi", "dami"],
    age: 410,
    groups: [{ key: "alte-vinyl", name: "Vinyl diggers", description: "Crate-digging trips, record swaps and what's on the turntable.", visibility: "private", owner: "amara", members: ["amara", "tobi", "sade"] }],
    posts: [
      { by: "amara", body: "Listening session Thursday — bring one track you can't stop replaying. We'll go round the room, no skips.", ago: 2, pinned: true },
      { by: "sade", body: "Flyer scans from the 2019 Yaba nights are up. Name a venue you remember and I'll dig out the matching poster.", ago: 6 },
    ],
  },
  {
    key: "run",
    name: "After Hours Run Club",
    description: "Evening runs through Lekki and Ikoyi — 5K social pace, 10K pace group, and post-run suya. Lights and good company provided.",
    interest: "running",
    city: "lagos",
    hood: "Lekki Phase 1",
    privacy: "public",
    owner: "chidi",
    members: ["chidi", "ife", "amara", "yusuf", "sade", "tobi"],
    age: 200,
    groups: [{ key: "run-sub50", name: "Sub-50 10K pacers", description: "Structured pace work for anyone chasing a sub-50 10K.", visibility: "private", owner: "chidi", members: ["chidi", "ife"] }],
    posts: [{ by: "chidi", body: "Tuesday route: Admiralty Way out-and-back, 8K. Meet at the roundabout at 6:15pm. Reflective gear please — it gets dark fast.", ago: 2, pinned: true }],
  },
  {
    key: "abuja-photo",
    name: "Abuja Photo Walks",
    description: "Monthly walks with cameras (phones count). We shoot, then swap notes over coffee. Great for beginners and working photographers alike.",
    interest: "photography",
    city: "abuja",
    hood: "Wuse 2",
    privacy: "public",
    owner: "zainab",
    members: ["zainab", "emeka", "yusuf"],
    age: 150,
    posts: [{ by: "zainab", body: "Next walk: Jabi Lake at golden hour. Bring a prime lens if you have one, or just your phone. We finish with coffee in Jabi.", ago: 3, pinned: true }],
  },
  {
    key: "girls-skate",
    name: "Girls Who Skate Lagos",
    description: "A calm, encouraging skate space for women and non-binary people in Lagos. Boards, pads and good vibes — no experience needed.",
    interest: "skate",
    city: "lagos",
    hood: "Yaba",
    privacy: "public",
    owner: "amara",
    members: ["amara", "sade", "folake"],
    age: 6,
    posts: [{ by: "amara", body: "We're new! First meetup is soon — message me if you need a board for the day.", ago: 1 }],
  },
  {
    key: "alte-art",
    name: "Alte Heads & Art Kids",
    description: "Where the music crowd meets the gallery crowd. Joint nights, zine swaps, and collaborations between sound and image.",
    interest: "art",
    city: "lagos",
    hood: "Victoria Island",
    privacy: "public",
    owner: "folake",
    members: ["folake", "amara", "ngozi", "dami"],
    age: 9,
    posts: [{ by: "folake", body: "Open call for the zine swap — bring a copy of anything you've made. Photocopied, risograph, hand-stapled — all welcome.", ago: 2 }],
  },
  {
    key: "yaba-thrift",
    name: "Yaba Thrift Collective",
    description: "Thrift runs, swap meets and styling sessions across Yaba and Surulere. Come for the finds, stay for the fit checks.",
    interest: "streetwear",
    city: "lagos",
    hood: "Yaba",
    privacy: "public",
    owner: "amara",
    members: ["amara", "ngozi", "emeka", "tobi"],
    age: 120,
    posts: [{ by: "amara", body: "Swap meet this month! Bring 5 pieces you no longer wear, leave with 5 you'll love.", ago: 4, pinned: true }],
  },
  {
    key: "film-lagos",
    name: "Lagos Film Club",
    description: "Screenings, short-film nights and honest feedback. Shoot on anything — 16mm, mini-DV or iPhone.",
    interest: "film",
    city: "lagos",
    hood: "Maryland",
    privacy: "public",
    owner: "dami",
    members: ["dami", "folake", "kunle", "tobi"],
    age: 90,
    posts: [{ by: "dami", body: "Short-film night is shaping up. Three slots left for 5-minute shorts — message me your logline.", ago: 3 }],
  },
  {
    key: "dance-lab",
    name: "Afrobeats Dance Lab",
    description: "Open-floor sessions and choreo breakdowns. Afrobeats, amapiano and everything in between.",
    interest: "dance",
    city: "lagos",
    hood: "Ikeja",
    privacy: "public",
    owner: "sade",
    members: ["sade", "chidi"],
    age: 70,
    posts: [{ by: "sade", body: "New choreo drop on Saturday. Beginners welcome — we break it down count by count.", ago: 2 }],
  },
  {
    key: "abuja-skate",
    name: "Abuja Skate Collective",
    description: "Skaters across Abuja linking up at Jabi and Wuse 2. New to skating? Come say hi and try a board.",
    interest: "skate",
    city: "abuja",
    hood: "Jabi",
    privacy: "public",
    owner: "yusuf",
    members: ["yusuf", "zainab", "emeka"],
    age: 60,
    posts: [{ by: "yusuf", body: "Smooth ground found at the new plaza in Jabi. Saturday morning session before the heat kicks in.", ago: 2 }],
  },
  {
    key: "abuja-art",
    name: "Abuja Art Walk",
    description: "Gallery crawls, studio visits and artist talks around Maitama and Wuse 2.",
    interest: "art",
    city: "abuja",
    hood: "Maitama",
    privacy: "public",
    owner: "zainab",
    members: ["zainab", "emeka"],
    age: 45,
    posts: [{ by: "zainab", body: "Studio crawl planned for the weekend after next — three studios, one afternoon, lots of tea.", ago: 5 }],
  },
  {
    key: "ikoyi-studio",
    name: "Ikoyi Studio Heads",
    description: "A private circle of working artists sharing studio space, leads and honest critique.",
    interest: "art",
    city: "lagos",
    hood: "Ikoyi",
    privacy: "private",
    owner: "ngozi",
    admins: ["folake"],
    members: ["ngozi", "folake", "dami"],
    age: 200,
    posts: [
      { by: "ngozi", body: "Studio visit on Friday — bring work in progress, not finished pieces. We critique the process.", ago: 2, pinned: true },
      { by: "folake", body: "Residency leads in the doc. Two deadlines this month.", ago: 4 },
    ],
  },
  {
    key: "accra-photo", name: "Accra Street Photographers", country: "GH", city: "accra", hood: "Osu", interest: "photography", privacy: "public", owner: "kwame", members: ["kwame", "efua", "tobi", "zainab"], age: 90,
    description: "Walks, critiques and the occasional exhibition. Film, digital, phone — all welcome.",
    posts: [{ by: "kwame", body: "Osu night market walk this week. Bring a fast lens.", ago: 1, pinned: true }],
  },
  {
    key: "accra-dance", name: "Accra Afro Dance Collective", country: "GH", city: "accra", hood: "Labone", interest: "dance", privacy: "public", owner: "efua", members: ["efua", "kwame", "sade"], age: 70,
    description: "Azonto, afrobeats, amapiano. Weekly open floor, monthly showcase.",
    posts: [{ by: "efua", body: "Open floor on Saturday, all levels.", ago: 2 }],
  },
  {
    key: "nairobi-run", name: "Nairobi Run Club", country: "KE", city: "nairobi", hood: "Karura", interest: "running", privacy: "public", owner: "wanjiru", members: ["wanjiru", "otieno", "chidi"], age: 120,
    description: "Long runs in Karura Forest, track on Tuesdays, chai after. Every pace welcome.",
    posts: [{ by: "wanjiru", body: "Sunday long run: 12K steady. Meet at Gate B at 6:30.", ago: 1, pinned: true }],
  },
  {
    key: "nairobi-art", name: "Nairobi Art Collective", country: "KE", city: "nairobi", hood: "Westlands", interest: "art", privacy: "public", owner: "otieno", members: ["otieno", "wanjiru", "folake"], age: 100,
    description: "Gallery nights, studio visits and open calls across Nairobi.",
    posts: [{ by: "otieno", body: "Gallery night on Friday. Three openings in walking distance.", ago: 2 }],
  },
  {
    key: "ct-skate", name: "Cape Town Skate Collective", country: "ZA", city: "cape-town", hood: "Woodstock", interest: "skate", privacy: "public", owner: "thabo", members: ["thabo", "lerato", "kunle", "tobi"], age: 150,
    description: "Woodstock, Sea Point and the City Bowl. Jams, clinics and film nights.",
    posts: [{ by: "thabo", body: "Jam this Saturday. Prizes from the shop.", ago: 1, pinned: true }],
  },
  {
    key: "joburg-street", name: "Joburg Streetwear Heads", country: "ZA", city: "johannesburg", hood: "Maboneng", interest: "streetwear", privacy: "public", owner: "lerato", members: ["lerato", "thabo", "amara"], age: 80,
    description: "Sneaker swaps, pop-ups and fit checks. Maboneng on Sundays.",
    posts: [{ by: "lerato", body: "Sneaker swap this weekend. Bring pairs to trade.", ago: 1 }],
  },
  {
    key: "london-afro", name: "London Afrobeats Nights", country: "GB", city: "london", hood: "Peckham", interest: "music", privacy: "public", owner: "zara", members: ["zara", "amara", "tobi", "kwame"], age: 110,
    description: "Afrobeats, amapiano and highlife nights across South London.",
    posts: [{ by: "zara", body: "Next social is Friday. Early-bird tickets are live.", ago: 1, pinned: true }],
  },
  {
    key: "pan-film", name: "Pan-African Film Club", country: "NG", city: "lagos", hood: "", interest: "film", privacy: "public", owner: "dami", members: ["dami", "otieno", "zara", "efua", "kunle"], age: 60,
    description: "Online watch parties and discussions of films from across the continent, plus meetups wherever we are.",
    posts: [{ by: "dami", body: "Watch party every other Thursday, online. Suggest titles here.", ago: 3, pinned: true }],
  },
];

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

interface SeedEvent {
  title: string;
  description: string;
  host: string;
  community?: string;
  group?: string;
  interest: InterestId;
  country?: string;
  city: CityId;
  hood: string;
  online?: boolean;
  venue: string;
  start: Date;
  durationHours: number;
  price: number;
  capacity?: number;
  going: string[];
  interested?: string[];
}

const EVENTS: SeedEvent[] = [
  { title: "Push Lagos: Open skate", description: "The weekly open session. Bring a board or borrow one, pads on request. All levels, no pressure — we start slow and get loud later. Free, forever.", host: "kunle", community: "waf", interest: "skate", city: "lagos", hood: "Lagos Island", venue: "Freedom Park", start: at(7, 16), durationHours: 3, price: 0, going: ["kunle", "tobi", "amara", "dami", "yusuf", "folake"], interested: ["sade"] },
  { title: "Soft Life, Loud Music", description: "A night of alté, indie and left-field sounds. Three live sets, one DJ, zero skips. Doors at 8, first set at 9. Come early, the room fills fast.", host: "amara", community: "alte", interest: "music", city: "lagos", hood: "Lekki Phase 1", venue: "The House, Lekki Phase 1", start: at(11, 20), durationHours: 5, price: 5000, capacity: 120, going: ["amara", "sade", "tobi", "emeka", "folake", "ngozi"], interested: ["dami"] },
  { title: "Beginner skate clinic", description: "Your first hour on a board, done right. Stance, pushing, stopping — with spare boards, helmets and pads provided. Perfect for total beginners.", host: "kunle", community: "waf", group: "waf-beginners", interest: "skate", city: "lagos", hood: "Lagos Island", venue: "Freedom Park", start: at(3, 10), durationHours: 2, price: 0, capacity: 20, going: ["kunle", "tobi", "amara"] },
  { title: "Sunday 5K social run", description: "Easy-pace 5K through Lekki, finishing at the suya spot. Walkers welcome, first-timers especially.", host: "chidi", community: "run", interest: "running", city: "lagos", hood: "Lekki Phase 1", venue: "Lekki Conservation Centre gate", start: at(1, 7), durationHours: 2, price: 0, going: ["chidi", "yusuf", "amara", "sade"] },
  { title: "Tuesday 10K pace group", description: "Structured 10K with pacers at 50, 55 and 60 minutes. Reflective gear and a headlamp strongly recommended.", host: "chidi", community: "run", group: "run-sub50", interest: "running", city: "lagos", hood: "Victoria Island", venue: "Admiralty Way roundabout", start: at(2, 18, 15), durationHours: 2, price: 0, going: ["chidi", "ife"] },
  { title: "Jabi Lake golden hour walk", description: "Cameras out for the best light of the day. We walk the lake, then compare frames over coffee.", host: "zainab", community: "abuja-photo", interest: "photography", city: "abuja", hood: "Jabi", venue: "Jabi Lake Mall waterfront", start: at(5, 16, 30), durationHours: 3, price: 0, going: ["zainab", "yusuf", "emeka"] },
  { title: "Vinyl swap & listening room", description: "Bring records, leave with different ones. A quiet room, a good sound system and one rule: no phones during the A-side.", host: "amara", community: "alte", group: "alte-vinyl", interest: "music", city: "lagos", hood: "Yaba", venue: "Hub Lagos, Yaba", start: at(4, 17), durationHours: 4, price: 2000, capacity: 40, going: ["amara", "tobi", "sade"] },
  { title: "Zine swap night", description: "Bring a copy of anything you've made — photocopied, riso, hand-stapled. Trade it for something new.", host: "folake", community: "alte-art", interest: "art", city: "lagos", hood: "Victoria Island", venue: "Alara Concept Store", start: at(8, 17), durationHours: 3, price: 1500, going: ["folake", "amara", "ngozi", "dami"] },
  { title: "Yaba thrift swap meet", description: "Bring five pieces you no longer wear. Swap, style and fit-check. Free entry; donations go to the neighbourhood clothing drive.", host: "amara", community: "yaba-thrift", interest: "streetwear", city: "lagos", hood: "Yaba", venue: "Tejuosho Market, Yaba", start: at(9, 13), durationHours: 4, price: 0, going: ["amara", "ngozi", "tobi", "emeka"] },
  { title: "Short-film night", description: "Eight shorts, five minutes each, then honest feedback. Pop-corn included. Shot on anything counts.", host: "dami", community: "film-lagos", interest: "film", city: "lagos", hood: "Maryland", venue: "Ventures Park Cinema, Maryland", start: at(13, 18), durationHours: 3, price: 3000, capacity: 60, going: ["dami", "folake", "kunle"], interested: ["tobi"] },
  { title: "Afrobeats open floor", description: "A choreo breakdown followed by an open floor. All levels — we count it out together.", host: "sade", community: "dance-lab", interest: "dance", city: "lagos", hood: "Ikeja", venue: "Dance Hub, Ikeja", start: at(6, 17), durationHours: 3, price: 2500, going: ["sade", "chidi"] },
  { title: "Abuja Saturday skate", description: "Morning session before the heat sets in. Spare boards on request.", host: "yusuf", community: "abuja-skate", interest: "skate", city: "abuja", hood: "Jabi", venue: "Jabi Plaza", start: at(6, 8), durationHours: 3, price: 0, going: ["yusuf", "zainab", "emeka"] },
  { title: "Maitama studio crawl", description: "Three studios, one afternoon. Artists host short talks and show work in progress.", host: "zainab", community: "abuja-art", interest: "art", city: "abuja", hood: "Maitama", venue: "Meeting at Maitama Amusement Park", start: at(12, 14), durationHours: 4, price: 1000, going: ["zainab", "emeka"] },
  { title: "Studio critique: work in progress", description: "Members only. Bring work that isn't finished — we critique the process, not the polish.", host: "ngozi", community: "ikoyi-studio", interest: "art", city: "lagos", hood: "Ikoyi", venue: "Ngozi's studio, Ikoyi", start: at(5, 15), durationHours: 3, price: 0, going: ["ngozi", "folake", "dami"] },
  { title: "Night riders: Marina session", description: "Invite-only late session on the smoothest stretch of the Marina. Location shared in the group.", host: "kunle", community: "waf", group: "waf-night", interest: "skate", city: "lagos", hood: "Lagos Island", venue: "The Marina (location in group)", start: at(10, 21), durationHours: 3, price: 0, going: ["kunle", "tobi"] },
  { title: "Girls Who Skate: first meetup", description: "A welcoming first session with boards, pads and no pressure. Everyone starts somewhere.", host: "amara", community: "girls-skate", interest: "skate", city: "lagos", hood: "Yaba", venue: "Yaba Tech car park", start: at(14, 15), durationHours: 3, price: 0, going: ["amara", "sade", "folake"] },
  { title: "Osu night market photo walk", description: "Neon, street food and long exposures. Bring a fast lens and a friend.", host: "kwame", community: "accra-photo", interest: "photography", country: "GH", city: "accra", hood: "Osu", venue: "Oxford Street, Osu", start: at(2, 18), durationHours: 3, price: 0, going: ["kwame", "efua", "tobi"] },
  { title: "Highlife & jollof Sunday", description: "Live highlife band, a jollof cook-off and a dance floor that opens at four.", host: "kwame", interest: "music", country: "GH", city: "accra", hood: "East Legon", venue: "Skybar, East Legon", start: at(4, 16), durationHours: 6, price: 80, capacity: 200, going: ["kwame", "efua", "sade"] },
  { title: "Accra open floor: afro dance", description: "A choreo breakdown followed by an open floor. All levels.", host: "efua", community: "accra-dance", interest: "dance", country: "GH", city: "accra", hood: "Labone", venue: "Labone Dance Studio", start: at(6, 17), durationHours: 3, price: 50, going: ["efua", "kwame"] },
  { title: "Kumasi sunrise 5K", description: "Easy 5K around the Kejetia loop, then breakfast.", host: "efua", interest: "running", country: "GH", city: "kumasi", hood: "", venue: "Prempeh II Jubilee Park", start: at(5, 6), durationHours: 2, price: 0, going: ["efua"] },
  { title: "Karura long run", description: "12K steady through the forest. All paces, nobody gets left behind.", host: "wanjiru", community: "nairobi-run", interest: "running", country: "KE", city: "nairobi", hood: "Karura", venue: "Karura Forest, Gate B", start: at(3, 6, 30), durationHours: 3, price: 0, going: ["wanjiru", "otieno", "chidi"] },
  { title: "Kilimani gallery night", description: "Three openings within walking distance, then drinks.", host: "otieno", community: "nairobi-art", interest: "art", country: "KE", city: "nairobi", hood: "Kilimani", venue: "Circle Art Gallery & friends", start: at(7, 18), durationHours: 4, price: 500, going: ["otieno", "wanjiru", "folake"] },
  { title: "Woodstock skate jam", description: "Best-trick jam with prizes from the shop. Spectators welcome.", host: "thabo", community: "ct-skate", interest: "skate", country: "ZA", city: "cape-town", hood: "Woodstock", venue: "Woodstock Skate Park", start: at(5, 13), durationHours: 4, price: 50, going: ["thabo", "lerato", "kunle", "tobi"] },
  { title: "Maboneng sneaker swap", description: "Trade pairs, meet collectors, fit-check on the rooftop.", host: "lerato", community: "joburg-street", interest: "streetwear", country: "ZA", city: "johannesburg", hood: "Maboneng", venue: "Arts on Main", start: at(8, 12), durationHours: 5, price: 0, going: ["lerato", "thabo", "amara"] },
  { title: "Amapiano Sundays", description: "Open-air amapiano set with guest DJs.", host: "lerato", interest: "music", country: "ZA", city: "johannesburg", hood: "Maboneng", venue: "Rooftop at 1 Fox", start: at(11, 15), durationHours: 6, price: 150, capacity: 300, going: ["lerato", "thabo"] },
  { title: "London Afrobeats social", description: "Afrobeats, amapiano and highlife until late. Dress to move.", host: "zara", community: "london-afro", interest: "music", country: "GB", city: "london", hood: "Peckham", venue: "Peckham Levels", start: at(9, 21), durationHours: 6, price: 12, capacity: 250, going: ["zara", "amara", "tobi", "kwame"] },
  { title: "Peckham film night", description: "Four African shorts, one Q&A with the directors.", host: "zara", interest: "film", country: "GB", city: "london", hood: "Peckham", venue: "Bussey Building", start: at(13, 19), durationHours: 3, price: 6, going: ["zara", "otieno"] },
  { title: "Pan-African short film watch party", description: "Online watch party followed by an open discussion. Link goes out in the community chat.", host: "dami", community: "pan-film", interest: "film", online: true, country: "NG", city: "lagos", hood: "", venue: "Online · link in chat", start: at(3, 20), durationHours: 2, price: 0, going: ["dami", "otieno", "zara", "efua", "kunle"] },
  { title: "Photography critique circle (online)", description: "Bring three frames, get honest notes from people across the continent.", host: "kwame", interest: "photography", online: true, country: "GH", city: "accra", hood: "", venue: "Online · Google Meet", start: at(6, 19), durationHours: 2, price: 0, going: ["kwame", "efua", "zainab", "tobi"] },
];

/* ------------------------------------------------------------------ */

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Copy .env.example to .env.local and set it first.");
    process.exit(1);
  }
  const reset = process.argv.includes("--reset");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log(`Connected to ${mongoose.connection.name}`);

  if (reset) {
    await Promise.all(
      [User, Community, Subcommunity, Membership, MembershipRequest, Invitation, Post, Board, Topic, TopicComment, TopicLike, Channel, ChannelCategory, ChannelMember, ChannelMessage, ChannelRead, LinkPreview, Reaction, Friendship, Event, Rsvp, SavedEvent, Conversation, Message, Block, Report].map((m) => (m as typeof User).deleteMany({})),
    );
    await ensureChannelIndexes(); // the channel slug index is per space now
    console.log("Cleared existing data.");
  } else if (await User.exists({ isDemo: true })) {
    console.log("Demo data already exists. Run `npm run seed:reset` to start fresh.");
    await mongoose.disconnect();
    return;
  }

  // Users
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = new Map<string, Types.ObjectId>();
  for (const u of USERS) {
    const doc = await User.create({
      email: `${u.handle}@demo.klique.ng`,
      passwordHash,
      emailVerifiedAt: new Date(),
      handle: u.handle,
      displayName: u.name,
      ...placeOf(u.country, u.city),
      neighborhood: u.hood,
      bio: u.bio,
      interests: u.interests,
      attendancePublic: u.attendancePublic ?? true,
      profileVisibility: u.profileVisibility ?? "public",
      dmPolicy: u.dmPolicy ?? "shared",
      isDemo: true,
    });
    users.set(u.handle, doc._id);
  }
  const uid = (h: string) => {
    const id = users.get(h);
    if (!id) throw new Error(`Unknown seed user: ${h}`);
    return id;
  };

  // Communities, groups, memberships, posts
  const communities = new Map<string, Types.ObjectId>();
  const groups = new Map<string, { id: Types.ObjectId; communityId: Types.ObjectId; visibility: "parent" | "private" }>();

  for (const c of COMMUNITIES) {
    const slug = c.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const createdAt = new Date(Date.now() - c.age * DAY);
    const doc = await Community.create({
      slug,
      name: c.name,
      description: c.description,
      interest: c.interest,
      ...placeOf(c.country, c.city),
      neighborhood: c.hood,
      privacy: c.privacy,
      // deterministic stock photo per community (picsum.photos); swap for real covers anytime
      coverImage: `https://picsum.photos/seed/klique-${c.key}/960/540`,
      ownerId: uid(c.owner),
      groupPolicy: c.key === COMMUNITIES[0].key ? "members" : "admins",
      createdAt,
    });
    communities.set(c.key, doc._id);

    const admins = new Set(c.admins ?? []);
    for (const h of c.members) {
      await Membership.create({ userId: uid(h), communityId: doc._id, subcommunityId: null, role: h === c.owner ? "owner" : admins.has(h) ? "admin" : "member" });
    }
    await recountMembers(doc._id, null);

    for (const g of c.groups ?? []) {
      const gslug = g.name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const sub = await Subcommunity.create({ communityId: doc._id, slug: gslug, name: g.name, description: g.description, visibility: g.visibility, ownerId: uid(g.owner) });
      groups.set(g.key, { id: sub._id, communityId: doc._id, visibility: g.visibility });
      for (const h of g.members) {
        await Membership.create({ userId: uid(h), communityId: doc._id, subcommunityId: sub._id, role: h === g.owner ? "owner" : "member" });
      }
      await recountMembers(doc._id, sub._id);
      // Groups get their own chat: #announcements and #general, with a little conversation.
      await ensureDefaultGroupChannels(sub._id, doc._id, uid(g.owner));
      const gen = await Channel.findOne({ communityId: doc._id, subcommunityId: sub._id, slug: "general" });
      if (gen) {
        const talk = g.members.filter((h) => h !== g.owner);
        const lines = [`Welcome to ${g.name}! Say hi 👋`, `@${talk[0] ?? g.owner} glad you're here.`, "Plans for this week go in this channel."];
        const made = await ChannelMessage.insertMany(
          lines.map((body, i) => ({
            channelId: gen._id,
            communityId: doc._id,
            subcommunityId: sub._id,
            authorId: uid(i === 1 || !talk.length ? g.owner : talk[i % talk.length]),
            body,
            mentions: i === 1 && talk[0] ? [uid(talk[0])] : [],
            createdAt: new Date(Date.now() - (lines.length - i) * 40 * 60_000),
          })),
        );
        const last = made[made.length - 1];
        await Channel.updateOne({ _id: gen._id }, { lastMessageId: last._id, lastMessageAt: last.createdAt });
      }
      if (g.key === "waf-beginners") {
        await Post.create({ communityId: doc._id, subcommunityId: sub._id, authorId: uid("kunle"), body: "Welcome! Bring water, wear flat shoes and don't worry about looking silly — we all did. First session is free.", pinned: true });
      }
    }

    for (const p of c.posts) {
      await Post.create({ communityId: doc._id, subcommunityId: null, authorId: uid(p.by), body: p.body, pinned: !!p.pinned, createdAt: new Date(Date.now() - p.ago * DAY) });
    }

    // Topics: a Reddit-style board with threaded comments and likes.
    {
      const crew = [c.owner, ...c.members.filter((m) => m !== c.owner)];
      const pick = (i: number) => uid(crew[i % crew.length]);
      // Boards: the admin names them. "Updates" is admins-only; the others are open to everyone.
      const boardDefs = [
        { slug: "updates", name: "Updates", description: "News from the organisers.", postPolicy: "admins" as const },
        { slug: "discussions", name: "Discussions", description: "Anything on your mind.", postPolicy: "members" as const },
        { slug: "projects", name: "Projects", description: "Show what you're working on.", postPolicy: "members" as const },
      ];
      const boards = await Board.insertMany(boardDefs.map((b, i) => ({ ...b, communityId: doc._id, position: i, createdById: uid(c.owner) })));
      const drafts = [
        { title: `What brought you to ${c.name}?`, body: "New here? Say hi and tell us what you're hoping to get out of it. Old hands, tell us what kept you around.", pinned: true, by: 0, ago: 6, media: [1, 2, 3].map((n) => ({ kind: "image" as const, url: `/mock/img-${n}.jpg`, poster: null })) },
        { title: "Ideas for the next meetup", body: "Drop a time, a place or a theme. Most-liked idea wins the next slot.", pinned: false, by: 1, ago: 3, media: [{ kind: "video" as const, url: "/mock/clip-1.mp4", poster: "/mock/clip-1.jpg" }] },
        { title: "Best spot nearby for after-session food?", body: "Looking for somewhere cheap, loud enough to chat and open late.", pinned: false, by: 2, ago: 1, media: [{ kind: "image" as const, url: "/mock/img-4.jpg", poster: null }] },
      ];
      for (const [ti, d] of drafts.entries()) {
        const created = new Date(Date.now() - d.ago * DAY);
        const t = await Topic.create({ communityId: doc._id, boardId: boards[[1, 0, 2][ti]]._id, authorId: pick(ti === 1 ? 0 : d.by), title: d.title, body: d.body, pinned: d.pinned, media: d.media, createdAt: created, lastActivityAt: created });
        const top = await TopicComment.create({ topicId: t._id, communityId: doc._id, authorId: pick(d.by + 1), parentId: null, body: ["Glad to be here. Mostly came for the people.", "Saturday mornings work best for me.", "There's a great suya stand two streets over."][ti], createdAt: new Date(+created + 3_600_000) });
        const reply = await TopicComment.create({ topicId: t._id, communityId: doc._id, authorId: pick(d.by + 2), parentId: top._id, body: ["Same, honestly.", "Seconded, mornings are easier.", "Yes! Go before 9pm or the queue gets silly."][ti], createdAt: new Date(+created + 2 * 3_600_000) });
        await TopicComment.create({ topicId: t._id, communityId: doc._id, authorId: pick(d.by), parentId: reply._id, body: "Noted, thank you.", createdAt: new Date(+created + 3 * 3_600_000) });
        const likers = crew.slice(0, 2 + ti);
        await TopicLike.insertMany(likers.map((h) => ({ userId: uid(h), topicId: t._id, targetType: "topic", targetId: t._id })));
        await TopicLike.create({ userId: uid(crew[0]), topicId: t._id, targetType: "comment", targetId: top._id });
        await TopicComment.updateOne({ _id: top._id }, { likeCount: 1 });
        await Topic.updateOne({ _id: t._id }, { likeCount: likers.length, commentCount: 3, lastActivityAt: new Date(+created + 3 * 3_600_000) });
      }
    }

    // Chat: default channels, the old "updates" become announcements, plus a lived-in #general.
    await ensureDefaultChannels(doc._id, uid(c.owner));
    const chans = await Channel.find({ communityId: doc._id, subcommunityId: null }).lean<{ _id: Types.ObjectId; slug: string }[]>();
    const chanId = (name: string) => chans.find((x) => x.slug === name)!._id;
    const rows: { channelId: Types.ObjectId; authorId: Types.ObjectId; body: string; createdAt: Date; mentions?: Types.ObjectId[] }[] = [];
    for (const p of c.posts) {
      rows.push({ channelId: chanId("announcements"), authorId: uid(p.by), body: p.body, createdAt: new Date(Date.now() - p.ago * DAY) });
    }
    // The first community gets a long history so scroll-up paging is easy to try (130 messages).
    const total = c.key === COMMUNITIES[0].key ? 130 : 14;
    const talkers = c.members.filter((h) => h !== "bot");
    for (let i = 0; i < total; i++) {
      const by = talkers[(i * 7 + (i % 3)) % talkers.length];
      const minutesAgo = Math.round((total - i) * (total > 50 ? 95 : 600) + (i % 5) * 3);
      rows.push({ channelId: chanId("general"), authorId: uid(by), body: CHATTER[(i * 5 + c.key.length) % CHATTER.length], createdAt: new Date(Date.now() - minutesAgo * 60_000) });
    }
    // A couple of messages that show off @mentions and link embeds.
    const [m1, m2] = talkers.filter((h) => h !== c.owner);
    const extra: { by: string; body: string; mins: number; tag?: string[] }[] = [
      ...(m1 ? [{ by: c.owner, body: `@${m1} can you bring the speaker on Sunday?`, mins: 25, tag: [m1] }] : []),
      ...(m2 && m1 ? [{ by: m1, body: `@${m2} @${c.owner} sure, I'll grab it.`, mins: 18, tag: [m2, c.owner] }] : []),
      { by: c.owner, body: "Watch this before Sunday, good tips for beginners: https://www.youtube.com/watch?v=dQw4w9WgXcQ", mins: 10 },
    ];
    for (const e of extra) {
      rows.push({ channelId: chanId("general"), authorId: uid(e.by), body: e.body, createdAt: new Date(Date.now() - e.mins * 60_000), mentions: (e.tag ?? []).map(uid) });
    }
    rows.push({ channelId: chanId("meetups"), authorId: uid(c.owner), body: "Use this channel to plan sessions. Drop a time and a spot and we'll see who's in.", createdAt: new Date(Date.now() - 3 * DAY) });
    // Insert oldest-first: message ids are time-ordered and paging walks the id.
    rows.sort((a, b) => +a.createdAt - +b.createdAt);
    const inserted = await ChannelMessage.insertMany(rows.map((r) => ({ ...r, communityId: doc._id })));
    if (c.key === COMMUNITIES[0].key) {
      // Reactions and a sticker, so the demo shows them straight away.
      const general = inserted.filter((m) => String(m.channelId) === String(chanId("general")));
      const recent = general.slice(-5);
      const kinds = ["like", "laugh", "love", "wow", "like"];
      for (const [i, m] of recent.entries()) {
        for (const h of talkers.slice(0, 2 + (i % 3))) await Reaction.create({ targetType: "channel", targetId: m._id, userId: uid(h), kind: kinds[(i + talkers.indexOf(h)) % kinds.length] }).catch(() => null);
      }
      // A picture, a reply to it, and a pinned house rule.
      const pic = await ChannelMessage.create({ channelId: chanId("general"), communityId: doc._id, authorId: uid(talkers[0] ?? c.owner), body: "Spot for Sunday. Smooth enough?", images: ["/mock/img-2.jpg", "/mock/img-5.jpg"], createdAt: new Date(Date.now() - 9 * 60_000) });
      await ChannelMessage.create({ channelId: chanId("general"), communityId: doc._id, authorId: uid(talkers[1] ?? c.owner), body: "Looks perfect, see you there.", replyToId: pic._id, createdAt: new Date(Date.now() - 7 * 60_000) });
      await ChannelMessage.create({ channelId: chanId("general"), communityId: doc._id, authorId: uid(c.owner), body: "House rules: be kind, wear a helmet, share the space.", pinnedAt: new Date(Date.now() - DAY), pinnedById: uid(c.owner), createdAt: new Date(Date.now() - 2 * DAY) });
      await ChannelMessage.create({ channelId: chanId("general"), communityId: doc._id, authorId: uid(talkers[1] ?? c.owner), body: "", sticker: "party", createdAt: new Date(Date.now() - 2 * 60_000) });
    }
    for (const ch of chans) {
      const last = [...inserted].reverse().find((m) => String(m.channelId) === String(ch._id));
      if (last) await Channel.updateOne({ _id: ch._id }, { lastMessageId: last._id, lastMessageAt: last.createdAt });
    }
    if (c.key === COMMUNITIES[0].key) {
      // A staff-only room (hidden from regular members) to show per-channel visibility.
      await Channel.create({ communityId: doc._id, slug: "hangout", name: "hangout", topic: "Drop in and talk while you skate.", type: "voice", visibility: "all", categoryId: null, position: 7, createdById: uid(c.owner) });
      const ops = await Channel.create({ communityId: doc._id, slug: "admins", name: "admins", topic: "Owners and admins only.", type: "text", visibility: "managers", categoryId: (await ChannelCategory.findOne({ communityId: doc._id, name: "Info" }))?._id ?? null, position: 5, createdById: uid(c.owner) });
      // An invite-only channel with a guest list (owners/admins always see it).
      const crew = await Channel.create({ communityId: doc._id, slug: "filming-crew", name: "filming-crew", topic: "Invite-only: who's filming Sunday.", type: "text", visibility: "invite", categoryId: null, position: 6, createdById: uid(c.owner) });
      for (const h of ["tobi", "dami"]) await ChannelMember.create({ channelId: crew._id, userId: uid(h), communityId: doc._id, subcommunityId: null, addedById: uid(c.owner) });
      await ChannelMessage.create({ channelId: crew._id, communityId: doc._id, authorId: uid("tobi"), body: "@dami I'll take the wide lens, you take the long one?", mentions: [uid("dami")] });
      await ChannelMessage.create({ channelId: ops._id, communityId: doc._id, authorId: uid(c.owner), body: "Staff room: moderation notes and planning live here. Members can't see this channel." });
    }
  }

  // Friends and friend requests for the demo (tobi has 3 friends, 1 request waiting, 1 sent).
  const friendPairs: [string, string, "accepted" | "pending"][] = [
    ["tobi", "kunle", "accepted"],
    ["tobi", "dami", "accepted"],
    ["tobi", "ngozi", "accepted"],
    ["amara", "tobi", "pending"],
    ["tobi", "sade", "pending"],
    ["kunle", "dami", "accepted"],
  ];
  for (const [a, b, st] of friendPairs) {
    await Friendship.create({ pairKey: pairKeyOf(uid(a), uid(b)), requesterId: uid(a), recipientId: uid(b), status: st, acceptedAt: st === "accepted" ? new Date() : null });
  }

  // A pending join request + a ready-to-use invite link for the private community.
  const studio = communities.get("ikoyi-studio")!;
  await MembershipRequest.create({ userId: uid("amara"), communityId: studio, subcommunityId: null, message: "Hi! I run a small zine press and would love to critique alongside you." });
  await Invitation.create({ code: "ikoyi-studio-demo", communityId: studio, subcommunityId: null, createdBy: uid("ngozi"), maxUses: 25 });
  const nightRiders = groups.get("waf-night")!;
  await Invitation.create({ code: "night-riders-demo", communityId: nightRiders.communityId, subcommunityId: nightRiders.id, createdBy: uid("kunle"), maxUses: 10 });

  // Events + RSVPs
  const eventIds: Types.ObjectId[] = [];
  for (const e of EVENTS) {
    const communityId = e.community ? communities.get(e.community)! : null;
    const group = e.group ? groups.get(e.group)! : null;
    const community = e.community ? COMMUNITIES.find((c) => c.key === e.community)! : null;
    const audience = group ? (group.visibility === "private" ? "subcommunity" : "community") : community ? (community.privacy === "public" ? "public" : "community") : "public";

    const doc = await Event.create({
      hostId: uid(e.host),
      communityId,
      subcommunityId: group?.id ?? null,
      audience,
      title: e.title,
      description: e.description,
      interest: e.interest,
      ...placeOf(e.country, e.city),
      online: e.online ?? false,
      currency: currencyOf(e.country ?? "NG"),
      neighborhood: e.hood,
      venue: e.venue,
      startsAt: e.start,
      endsAt: new Date(e.start.getTime() + e.durationHours * HOUR),
      priceNaira: e.price,
      capacity: e.capacity ?? null,
      coverImage: `https://picsum.photos/seed/klique-ev-${eventIds.length}-${e.interest}/960/540`,
    });
    eventIds.push(doc._id);
    for (const h of e.going) await Rsvp.create({ eventId: doc._id, userId: uid(h), status: "going" });
    for (const h of e.interested ?? []) await Rsvp.create({ eventId: doc._id, userId: uid(h), status: "interested" });
    await recountRsvps(doc._id);
  }

  // Saved events for the main demo user
  for (const i of [1, 6, 7]) await SavedEvent.create({ eventId: eventIds[i], userId: uid("tobi") });

  // A conversation with an unread message, so the inbox isn't empty.
  const tobi = uid("tobi");
  const amara = uid("amara");
  const convo = await Conversation.create({ participants: [tobi, amara], participantKey: participantKey(tobi, amara), unread: { [String(tobi)]: 0, [String(amara)]: 0 } });
  const lines: [Types.ObjectId, string, number][] = [
    [amara, "Yo! Are you going to Soft Life, Loud Music next week?", 55],
    [tobi, "100%. Bringing the film camera too.", 40],
    [amara, "Perfect — shoot the stage lights for the Archive zine?", 12],
  ];
  let last: { body: string; senderId: Types.ObjectId; createdAt: Date } | null = null;
  for (const [sender, body, minsAgo] of lines) {
    const createdAt = new Date(Date.now() - minsAgo * 60_000);
    await Message.create({ conversationId: convo._id, senderId: sender, body, createdAt });
    last = { body, senderId: sender, createdAt };
  }
  await Conversation.updateOne({ _id: convo._id }, { lastMessage: last, lastMessageAt: last!.createdAt, [`unread.${String(tobi)}`]: 1 });

  console.log("\nSeeded:");
  console.log(`  ${USERS.length} people · ${COMMUNITIES.length} communities · ${groups.size} groups · ${EVENTS.length} events`);
  console.log("\nSign in with any demo account, e.g.");
  console.log(`  tobi@demo.klique.ng / ${DEMO_PASSWORD}   (community admin, has an unread message)`);
  console.log(`  ngozi@demo.klique.ng / ${DEMO_PASSWORD}  (owns the private community, has a pending join request)`);
  console.log("Invite links to try: /invite/ikoyi-studio-demo and /invite/night-riders-demo");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
