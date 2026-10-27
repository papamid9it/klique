/**
 * Test data for the home feed: turns on Posts (any member can post) in some communities and fills them with
 * about 120 posts from their members over the last 14 days (pictures, a few videos), with up and down votes,
 * nested comments and comment reactions, so ranking, comments and infinite scroll can be tried for real.
 *
 *   npm run seed:feed -- --yes                     # the communities of every seeded demo account
 *   npm run seed:feed -- --user tobi --yes          # only the communities this person is in (handle or email);
 *                                                    they post, vote, comment and react nothing themselves, so
 *                                                    every vote you see on your own account is one you made
 *   npm run seed:feed -- --clean --yes              # remove exactly what this script created, and turn Posts
 *                                                    back off where it turned them on
 *
 * Everything it writes is tagged `seed: "feed"`. It prints the database it's about to write to and won't
 * write without --yes (or a "y" when asked). Pictures and videos are the app's own samples (public/mock) and
 * the picsum.photos stock pictures the main seed already uses.
 */
import { config } from "dotenv";
import mongoose, { Types } from "mongoose";
import { createInterface } from "node:readline/promises";

config({ path: ".env.local" });
config();

import { AppSetting } from "../server/models/AppSetting";
import { Community } from "../server/models/Community";
import { FeedComment, FeedPost, FeedVote } from "../server/models/FeedPost";
import { Membership } from "../server/models/Membership";
import { Reaction } from "../server/models/Reaction";
import { User } from "../server/models/User";

const TAG = "feed";
const SETTING = "seed:feed";
const POSTS = 120;
const DAY = 24 * 60 * 60 * 1000;
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// a small seeded random, so two runs look alike
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const CAPTIONS = [
  "Golden hour hit different today.",
  "Who's coming next week? Same spot.",
  "Throwback to last Saturday 🔥",
  "Tried a new trick, nearly made it.",
  "Rate the fit, honestly.",
  "Found this place by accident. Must come back.",
  "Small crew, big energy.",
  "Rain didn't stop us.",
  "First time here and everyone was so welcoming.",
  "Proof I actually showed up this time 😅",
  "Swipe for the blooper.",
  "Lagos at night >",
  "Practice, practice, practice.",
  "Who made this playlist? Need it.",
  "Sunday reset.",
  "",
  "",
];
const COMMENTS = ["This is so good!", "Wait, where is this?", "I need to come next time.", "Haha the second one 😂", "Clean.", "Who took these?", "Love this energy", "Same time next week?", "Saving this", "No way that's Lagos", "Teach me!!", "🔥🔥🔥"];
const REPLIES = ["Right?!", "Freedom Park, by the gate.", "Come through!", "It was a vibe.", "Me, on my phone 😅", "Next week for sure.", "Facts.", "Ask nicely 😂"];
const REACTIONS = ["like", "love", "laugh", "wow"]; // must be kinds the app offers (lib/reactions REACTION_IDS)

function media() {
  const roll = rand();
  if (roll < 0.12) {
    const n = between(1, 2);
    return [{ kind: "video" as const, url: `/mock/clip-${n}.mp4`, poster: `/mock/clip-${n}.jpg` }];
  }
  const count = roll < 0.6 ? 1 : between(2, 5);
  return Array.from({ length: count }, () => (rand() < 0.5 ? { kind: "image" as const, url: `/mock/img-${between(1, 6)}.jpg`, poster: null } : { kind: "image" as const, url: `https://picsum.photos/seed/klique-feed-${between(1, 400)}/1080/1080`, poster: null }));
}

async function confirm(what: string) {
  const host = new URL(process.env.MONGODB_URI!.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  console.log(`\nAbout to ${what} in the database at: ${host} (${mongoose.connection.db?.databaseName})`);
  if (flag("yes")) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Go ahead? (y/N) ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    console.log("Nothing changed.");
    await mongoose.disconnect();
    process.exit(0);
  }
}

async function clean() {
  await confirm("remove the seeded feed posts");
  // what it made, plus anything real people added on the seeded posts since (votes, comments, reactions)
  const postIds = (await FeedPost.collection.find({ seed: TAG }).project({ _id: 1 }).toArray()).map((d) => d._id);
  const commentIds = (await FeedComment.collection.find({ $or: [{ seed: TAG }, { postId: { $in: postIds } }] }).project({ _id: 1 }).toArray()).map((d) => d._id);
  const [p, c, v, r] = await Promise.all([
    FeedPost.collection.deleteMany({ seed: TAG }),
    FeedComment.collection.deleteMany({ _id: { $in: commentIds } }),
    FeedVote.collection.deleteMany({ $or: [{ seed: TAG }, { postId: { $in: postIds } }] }),
    Reaction.collection.deleteMany({ $or: [{ seed: TAG }, { targetType: "feedComment", targetId: { $in: commentIds } }] }),
  ]);
  // turn Posts off again where this script turned it on (and nobody has posted for real since)
  const row = await AppSetting.findById(SETTING).lean<{ value?: { turnedOn?: string[] } }>();
  let off = 0;
  for (const id of row?.value?.turnedOn ?? []) {
    if (await FeedPost.exists({ communityId: id })) continue;
    off += (await Community.updateOne({ _id: id, feedPolicy: "members" }, { $set: { feedPolicy: "off" } })).modifiedCount;
  }
  await AppSetting.deleteOne({ _id: SETTING });
  console.log(`Removed ${p.deletedCount} posts, ${c.deletedCount} comments, ${v.deletedCount} votes, ${r.deletedCount} reactions. Posts turned back off in ${off} communities.`);
}

async function seed() {
  const who = option("user");
  let communityIds: Types.ObjectId[];
  let you: Types.ObjectId | null = null;
  if (who) {
    const u = await User.findOne(who.includes("@") ? { email: who.toLowerCase() } : { handle: who.replace(/^@/, "").toLowerCase() }).select("_id handle").lean<{ _id: Types.ObjectId; handle: string }>();
    if (!u) throw new Error(`Nobody found for "${who}".`);
    you = u._id;
    communityIds = (await Membership.find({ userId: u._id, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>()).map((m) => m.communityId);
  } else {
    const demo = await User.find({ email: /@demo\.klique\.ng$/ }).select("_id").lean<{ _id: Types.ObjectId }[]>();
    communityIds = [...new Set((await Membership.find({ userId: { $in: demo.map((d) => d._id) }, subcommunityId: null, status: "active" }).distinct("communityId")).map(String))].map((id) => new Types.ObjectId(id));
  }
  const communities = await Community.find({ _id: { $in: communityIds }, official: { $ne: true } }).select("_id name feedPolicy").lean<{ _id: Types.ObjectId; name: string; feedPolicy?: string }[]>();
  if (!communities.length) throw new Error("No communities to fill.");
  await confirm(`add about ${POSTS} posts across ${communities.length} communities (${communities.map((c) => c.name).join(", ")})`);

  // Posts on (any member) where it's off; remember which, so --clean can undo it
  const turnedOn = communities.filter((c) => (c.feedPolicy ?? "off") === "off").map((c) => c._id);
  if (turnedOn.length) await Community.updateMany({ _id: { $in: turnedOn } }, { $set: { feedPolicy: "members" } });
  await AppSetting.updateOne({ _id: SETTING }, { $addToSet: { "value.turnedOn": { $each: turnedOn.map(String) } } }, { upsert: true });

  const members = new Map<string, Types.ObjectId[]>();
  for (const c of communities) members.set(String(c._id), (await Membership.find({ communityId: c._id, subcommunityId: null, status: "active", ...(you ? { userId: { $ne: you } } : {}) }).select("userId").lean<{ userId: Types.ObjectId }[]>()).map((m) => m.userId));

  const now = Date.now();
  let posts = 0, votes = 0, comments = 0, reactions = 0;
  for (let i = 0; i < POSTS; i++) {
    const c = communities[i % communities.length];
    const people = members.get(String(c._id)) ?? [];
    if (people.length < 2) continue;
    const author = pick(people);
    const createdAt = new Date(now - rand() * 14 * DAY);
    const postId = new Types.ObjectId();

    // votes from other members: mostly up
    const voters = people.filter((p) => String(p) !== String(author) && rand() < 0.55);
    const voteRows = voters.map((userId) => ({ _id: new Types.ObjectId(), postId, userId, value: rand() < 0.82 ? 1 : -1, createdAt: new Date(createdAt.getTime() + rand() * DAY), seed: TAG }));
    const up = voteRows.filter((v) => v.value === 1).length;

    // comments, nested up to three levels, with reactions
    const commentRows: Record<string, unknown>[] = [];
    const reactionRows: Record<string, unknown>[] = [];
    const add = (parentId: Types.ObjectId | null, depth: number, at: number) => {
      const id = new Types.ObjectId();
      const by = pick(people);
      commentRows.push({ _id: id, postId, communityId: c._id, authorId: by, parentId, body: depth ? pick(REPLIES) : pick(COMMENTS), deletedAt: null, createdAt: new Date(at), seed: TAG });
      for (const p of people) if (String(p) !== String(by) && rand() < 0.2) reactionRows.push({ _id: new Types.ObjectId(), targetType: "feedComment", targetId: id, userId: p, kind: pick(REACTIONS), createdAt: new Date(at + 3600_000), seed: TAG });
      if (depth < 2 && rand() < 0.45) for (let k = between(1, 2); k > 0; k--) add(id, depth + 1, at + between(5, 300) * 60_000);
    };
    for (let k = rand() < 0.75 ? between(1, 4) : 0; k > 0; k--) add(null, 0, createdAt.getTime() + between(10, 600) * 60_000);

    await FeedPost.collection.insertOne({ _id: postId, communityId: c._id, authorId: author, caption: pick(CAPTIONS), media: media(), upCount: up, downCount: voteRows.length - up, commentCount: commentRows.length, editedAt: null, createdAt, seed: TAG });
    if (voteRows.length) await FeedVote.collection.insertMany(voteRows);
    if (commentRows.length) await FeedComment.collection.insertMany(commentRows);
    if (reactionRows.length) await Reaction.collection.insertMany(reactionRows);
    posts++;
    votes += voteRows.length;
    comments += commentRows.length;
    reactions += reactionRows.length;
  }
  console.log(`Added ${posts} posts, ${votes} votes, ${comments} comments, ${reactions} comment reactions. Posts turned on in ${turnedOn.length} communities.`);
  console.log(`Undo with: npm run seed:feed -- --clean --yes`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI isn't set (.env.local).");
  await mongoose.connect(process.env.MONGODB_URI);
  if (flag("clean")) await clean();
  else await seed();
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
