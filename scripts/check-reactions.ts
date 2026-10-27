/**
 * Two people tapping the same reaction chip, on post comments, channel chat, a board post's chat and DMs:
 * the second tap adds theirs (count 2), tapping again takes it back. Also checks that a reaction kind the app
 * doesn't offer never comes back as a chip (it couldn't be tapped). And stickers in post comments and replies.
 *
 * It writes comments and messages, so point it at a dev server on a throwaway database seeded with `npm run seed`
 * and `npm run seed:feed` — never at real data:
 *   CHECK_BASE=http://localhost:3099 SEED_DEMO_PASSWORD=… npm run check:reactions
 */
import assert from "node:assert/strict";
import { REACTION_IDS } from "../lib/reactions";
import { feedReactSchema, reactSchema } from "../server/validators/schemas";

// every kind the pickers offer is one the server accepts
for (const kind of REACTION_IDS) {
  assert.ok(reactSchema.safeParse({ kind }).success, kind);
  assert.ok(feedReactSchema.safeParse({ kind }).success, kind);
}

const BASE = process.env.CHECK_BASE;
const PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!BASE || !PASSWORD) {
  console.log("Reaction kinds OK. Set CHECK_BASE and SEED_DEMO_PASSWORD to also run the two-person check against a throwaway server.");
  process.exit(0);
}
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("CHECK_BASE must be a local throwaway server.");

type Chip = { kind: string; count: number; mine: boolean };

async function signIn(handle: string) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-klique-client": "native" }, body: JSON.stringify({ email: `${handle}@demo.klique.ng`, password: PASSWORD }) });
  assert.equal(res.status, 200, `sign in ${handle}`);
  const token = ((await res.json()) as { data: { token: string } }).data.token;
  const call = (method: string, path: string, body?: unknown) => fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return Object.assign(async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await call(method, path, body);
    const json = (await r.json().catch(() => null)) as { data: T; error?: { message: string } } | null;
    assert.ok(r.ok, `${method} ${path} → ${r.status} ${json?.error?.message ?? ""}`);
    return json!.data;
  }, { status: async (method: string, path: string, body?: unknown) => (await call(method, path, body)).status });
}

/** A reacts, B taps A's chip (both now), B taps it again (just A). */
async function chipTaps(where: string, react: (as: "a" | "b", kind: string) => Promise<Chip[]>) {
  let list = await react("a", "like");
  assert.deepEqual(list, [{ kind: "like", count: 1, mine: true }], where);
  list = await react("b", "like");
  assert.deepEqual(list, [{ kind: "like", count: 2, mine: true }], `${where}: second person's tap adds theirs`);
  list = await react("b", "like");
  assert.deepEqual(list, [{ kind: "like", count: 1, mine: false }], `${where}: tapping again takes it back`);
  console.log(`ok  ${where}`);
}

async function main() {
  const slug = "waf-skate-crew";
  const as = { a: await signIn("tobi"), b: await signIn("amara") };
  const stamp = `reaction check ${Date.now()}`;

  // post comments
  const posts = await as.a<{ items: { id: string }[] }>("GET", `/api/communities/${slug}/feed`);
  const post = posts.items[0].id;
  const comment = await as.a<{ id: string }>("POST", `/api/communities/${slug}/feed/${post}/comments`, { body: stamp });
  await chipTaps("post comment", (who, kind) => as[who]<Chip[]>("POST", `/api/communities/${slug}/feed/${post}/comments/${comment.id}/reactions`, { kind }));
  // no chip for a kind the app doesn't offer (old seeded data)
  const comments = await as.b<{ id: string; reactions: Chip[] }[]>("GET", `/api/communities/${slug}/feed/${post}/comments`);
  const offered = new Set<string>(REACTION_IDS);
  for (const c of comments) for (const r of c.reactions) assert.ok(offered.has(r.kind), `comment chip "${r.kind}" can't be tapped`);

  // stickers in comments: on their own, with text, in a reply; nothing at all or a picture that isn't ours is refused
  const commentsUrl = `/api/communities/${slug}/feed/${post}/comments`;
  type Stuck = { id: string; body: string; sticker: string | null; stickerUrl: string | null };
  const solo = await as.a<Stuck>("POST", commentsUrl, { body: "", sticker: "party" });
  assert.deepEqual([solo.body, solo.sticker, solo.stickerUrl], ["", "party", null]);
  const pic = await as.b<Stuck>("POST", commentsUrl, { body: stamp, stickerUrl: "/mock/img-1.jpg", parentId: solo.id });
  assert.deepEqual([pic.body, pic.sticker, pic.stickerUrl], [stamp, null, "/mock/img-1.jpg"]);
  assert.equal(await as.a.status("POST", commentsUrl, { body: "  " }), 422, "empty comment refused");
  assert.equal(await as.a.status("POST", commentsUrl, { body: "", sticker: "not-a-sticker" }), 422, "unknown sticker refused");
  assert.equal(await as.a.status("POST", commentsUrl, { body: "", stickerUrl: "https://example.com/x.png" }), 400, "foreign picture refused");
  await as.a("DELETE", `${commentsUrl}/${solo.id}`);
  const after = await as.b<Stuck[]>("GET", commentsUrl);
  assert.deepEqual(after.filter((c) => c.id === solo.id).map((c) => [c.sticker, c.stickerUrl]), [[null, null]], "a deleted comment loses its sticker");
  console.log("ok  post comment stickers");

  // channel chat
  const msg = await as.a<{ id: string }>("POST", `/api/communities/${slug}/channels/general/messages`, { body: stamp });
  await chipTaps("channel chat", (who, kind) => as[who]<Chip[]>("POST", `/api/communities/${slug}/channels/general/messages/${msg.id}/reactions`, { kind }));

  // a board post's chat (made when the post is first opened)
  const topics = await as.a<{ items: { id: string }[] }>("GET", `/api/communities/${slug}/topics`);
  const topic = topics.items[0].id;
  await as.a("GET", `/api/communities/${slug}/topics/${topic}`);
  const reply = await as.a<{ id: string }>("POST", `/api/communities/${slug}/channels/post-${topic}/messages`, { body: stamp });
  await chipTaps("board post chat", (who, kind) => as[who]<Chip[]>("POST", `/api/communities/${slug}/channels/post-${topic}/messages/${reply.id}/reactions`, { kind }));

  // DMs
  const convo = (await as.a<{ conversation: { id: string } }>("POST", "/api/conversations", { handle: "amara" })).conversation;
  const dm = await as.a<{ id: string }>("POST", `/api/conversations/${convo.id}/messages`, { body: stamp });
  await chipTaps("DM", (who, kind) => as[who]<Chip[]>("POST", `/api/conversations/${convo.id}/messages/${dm.id}/reactions`, { kind }));

  console.log("Reaction chips OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
