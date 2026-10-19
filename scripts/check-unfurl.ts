/** Offline checks for the link-preview safety rules and the OpenGraph parser. Run: npm run check:unfurl */
import assert from "node:assert/strict";
import { extractMentionHandles, activeMention } from "../lib/mentions";
import { assertPublicHttpUrl, isBlockedAddress } from "../server/net-guard";
import { parseOpenGraph } from "../server/services/unfurl.service";

// Addresses that must never be fetched.
for (const bad of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::1", "not-an-ip"]) {
  assert.equal(isBlockedAddress(bad), true, `${bad} should be blocked`);
}
for (const ok of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "203.1.1.1", "2606:4700:4700::1111"]) {
  assert.equal(isBlockedAddress(ok), false, `${ok} should be allowed`);
}

// URL vetting.
for (const bad of ["ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "http://localhost/x", "http://127.0.0.1/", "http://[::1]/", "http://2130706433/", "http://user:pw@example.com/", "https://example.com:8443/", "http://intranet/", "http://metadata.internal/", "http://169.254.169.254/latest/meta-data/", "http://foo.local/"]) {
  assert.throws(() => assertPublicHttpUrl(bad), `${bad} should be rejected`);
}
assert.equal(assertPublicHttpUrl("https://www.example.com/a?b=1#c").hostname, "www.example.com");

// OpenGraph parsing.
const page = new URL("https://news.example.com/story/1");
const og = parseOpenGraph(
  `<html><head><title>Fallback &amp; title</title>
   <meta property="og:title" content="Big &quot;news&quot; today">
   <meta property="og:description" content="A short   summary.">
   <meta property="og:image" content="/img/cover.jpg">
   <meta property="og:site_name" content="Example News">
   <meta property="og:video" content="https://cdn.example.com/clip.mp4">
   </head><body>ignored</body></html>`,
  page,
);
assert.equal(og.title, 'Big "news" today');
assert.equal(og.description, "A short summary.");
assert.equal(og.image, "https://news.example.com/img/cover.jpg");
assert.equal(og.siteName, "Example News");
assert.equal(og.videoUrl, "https://cdn.example.com/clip.mp4");
const none = parseOpenGraph(`<head><title>Only a title</title><meta property="og:image" content="javascript:alert(1)"><meta property="og:video" content="https://x.example/embed/123"></head>`, page);
assert.equal(none.title, "Only a title");
assert.equal(none.image, null); // non-http(s) image rejected
assert.equal(none.videoUrl, null); // embed pages are not played inline
assert.equal(none.siteName, "news.example.com");

// @mentions.
assert.deepEqual(extractMentionHandles("hey @Tobi and @ngozi_e, not an@email.com or @ab"), ["tobi", "ngozi_e"]);
assert.deepEqual(extractMentionHandles("@tobi @tobi"), ["tobi"]);
assert.deepEqual(activeMention("hello @to", 9), { start: 6, query: "to" });
assert.equal(activeMention("hello there", 11), null);
assert.equal(activeMention("mail me at a@b", 14), null);

console.log("All link-preview and mention checks passed.");

/* ---- reactions and stickers ---- */
void (async () => {
  const { sendMessageSchema, reactSchema } = await import("../server/validators/schemas");
  const eq = (name: string, got: unknown, want: unknown) => {
    if (got !== want) {
      console.error(`FAIL ${name}: got ${String(got)}, want ${String(want)}`);
      process.exit(1);
    }
  };
  eq("text ok", sendMessageSchema.safeParse({ body: "hi" }).success, true);
  eq("sticker only ok", sendMessageSchema.safeParse({ sticker: "party" }).success, true);
  eq("empty rejected", sendMessageSchema.safeParse({ body: "  " }).success, false);
  eq("unknown sticker rejected", sendMessageSchema.safeParse({ sticker: "../../x" }).success, false);
  eq("reaction ok", reactSchema.safeParse({ kind: "laugh" }).success, true);
  eq("unknown reaction rejected", reactSchema.safeParse({ kind: "<script>" }).success, false);
  const { applyReaction } = await import("../lib/reactions");
  const start = [{ kind: "like", count: 3, mine: true }, { kind: "laugh", count: 1, mine: false }] as { kind: "like" | "laugh" | "angry"; count: number; mine: boolean }[];
  const swapped = applyReaction(start, "angry");
  eq("replace: like drops", swapped.find((r) => r.kind === "like")?.count, 2);
  eq("replace: angry is mine", swapped.find((r) => r.kind === "angry")?.mine, true);
  eq("one mine only", swapped.filter((r) => r.mine).length, 1);
  eq("same kind removes", applyReaction(start, "like").some((r) => r.mine), false);
  eq("last one disappears", applyReaction([{ kind: "like", count: 1, mine: true }], "like").length, 0);
  const { friendRequestSchema, friendRespondSchema } = await import("../server/validators/schemas");
  eq("friend handle ok", friendRequestSchema.safeParse({ handle: "tobi" }).success, true);
  eq("friend junk handle rejected", friendRequestSchema.safeParse({ handle: "../x" }).success, false);
  eq("respond ok", friendRespondSchema.safeParse({ action: "accept" }).success, true);
  eq("respond junk rejected", friendRespondSchema.safeParse({ action: "ban" }).success, false);
  console.log("Reaction and sticker validation passed.");
})();

void (async () => {
  const pl = await import("../lib/places");
  const { eventListQuery, eventCreateSchema } = await import("../server/validators/schemas");
  const eq = (name: string, got: unknown, want: unknown) => {
    if (got !== want) {
      console.error(`FAIL ${name}: got ${String(got)}, want ${String(want)}`);
      process.exit(1);
    }
  };
  for (const v of ["world", "continent:africa", "country:NG", "region:NG:lagos", "city:GH:accra"]) eq(`scope round-trip ${v}`, pl.scopeToString(pl.parseScope(v)!), v);
  for (const v of ["", "country:XX", "city:NG", "continent:mars", "region:NG:../x", "country:NG:extra", "$ne"]) eq(`bad scope ${v}`, pl.parseScope(v), null);
  eq("country filter", JSON.stringify(pl.scopeFilter(pl.parseScope("country:GH"))), '{"country":"GH"}');
  eq("continent filter spans countries", ((pl.scopeFilter(pl.parseScope("continent:africa")) as { country: { $in: string[] } }).country.$in).includes("KE"), true);
  eq("world has no filter", Object.keys(pl.scopeFilter(pl.WORLD)).length, 0);
  eq("search finds Accra", pl.searchScopes("accra").some((s) => s.level === "city" && s.city === "accra"), true);
  eq("search finds Ghana", pl.searchScopes("ghan").some((s) => s.level === "country" && s.country === "GH"), true);
  eq("flag", pl.flag("NG"), "\u{1F1F3}\u{1F1EC}");
  eq("place label", pl.placeLabel({ country: "GH", city: "accra" }), "Accra, Ghana");
  eq("free-text city label", pl.placeLabel({ country: "NG", city: "ikot-ekpene" }), "Ikot Ekpene, Nigeria");
  eq("region needs its country", pl.validatePlace({ country: "NG", region: "greater-accra", city: "lagos" }) !== null, true);
  eq("known place ok", pl.validatePlace({ country: "GH", region: "greater-accra", city: "accra" }), null);
  eq("bad country", pl.validatePlace({ country: "ZZ", city: "x" } as never) !== null, true);
  eq("where in list query ok", eventListQuery.safeParse({ where: "country:KE" }).success, true);
  eq("where junk rejected", eventListQuery.safeParse({ where: "country:XX" }).success, false);
  eq("day junk rejected", eventListQuery.safeParse({ day: "tomorrow" }).success, false);
  const base = { title: "Test event", interest: "skate", venue: "Park", startsAt: new Date(Date.now() + 86_400_000).toISOString() };
  eq("event with place ok", eventCreateSchema.safeParse({ ...base, country: "GH", city: "accra" }).success, true);
  eq("event without country rejected", eventCreateSchema.safeParse({ ...base, city: "accra" }).success, false);
  eq("currency must be ISO", eventCreateSchema.safeParse({ ...base, country: "GH", city: "accra", currency: "cedis" }).success, false);
  console.log("Place and scope checks passed.");
})();
