/** Sanity checks for the pure authorization rules. Run: npm run check:policies */
import assert from "node:assert/strict";
import { canCreateGroup, canPostInChannel, canSeeChannel, canSetRole, communityAccessFrom, outranks, subAccessFrom } from "../server/policies/access";
import type { IMembership } from "../server/models/Membership";

const m = (role: IMembership["role"], status: IMembership["status"] = "active") => ({ role, status }) as IMembership;

// Public community: anyone can view; joining is direct.
let a = communityAccessFrom({ privacy: "public" }, null, false);
assert.equal(a.canView, true); assert.equal(a.canPost, false); assert.equal(a.canJoinDirectly, true);

// Private community: non-members cannot view or join directly; a pending request is reflected.
a = communityAccessFrom({ privacy: "private" }, null, true);
assert.equal(a.canView, false); assert.equal(a.canJoinDirectly, false); assert.equal(a.pendingRequest, true);

// Banned members stay locked out.
a = communityAccessFrom({ privacy: "public" }, m("member", "banned"), false);
assert.equal(a.canJoinDirectly, false); assert.equal(a.isMember, false); assert.equal(a.banned, true);

// Managers vs members.
assert.equal(communityAccessFrom({ privacy: "private" }, m("admin"), false).canManage, true);
assert.equal(communityAccessFrom({ privacy: "private" }, m("member"), false).canManage, false);

// "parent" group: parent members can see/join; outsiders cannot.
let s = subAccessFrom({ visibility: "parent" }, m("member"), null);
assert.equal(s.canView, true); assert.equal(s.canJoinDirectly, true);
s = subAccessFrom({ visibility: "parent" }, null, null);
assert.equal(s.canView, false); assert.equal(s.canJoinDirectly, false);

// Private group: parent membership alone grants neither view nor join; parent admins can only moderate.
s = subAccessFrom({ visibility: "private" }, m("member"), null);
assert.equal(s.canView, false); assert.equal(s.canJoinDirectly, false); assert.equal(s.canModerate, false);
s = subAccessFrom({ visibility: "private" }, m("admin"), null);
assert.equal(s.canView, false); assert.equal(s.canModerate, true);
s = subAccessFrom({ visibility: "private" }, m("member"), m("member"));
assert.equal(s.canView, true); assert.equal(s.canPost, true);

// Role rules.
assert.equal(outranks("admin", "admin"), false); assert.equal(outranks("owner", "admin"), true);
assert.equal(canSetRole("admin", "member", "admin"), false); assert.equal(canSetRole("owner", "member", "admin"), true);
assert.equal(canSetRole("owner", "member", "owner"), false);

// Channels: reading follows the community; posting needs membership; announcement = managers only; staff rooms are hidden.
const open = { visibility: "all", type: "text" } as const;
const news = { visibility: "all", type: "announcement" } as const;
const staff = { visibility: "managers", type: "text" } as const;
const pub = { signedOut: communityAccessFrom({ privacy: "public" }, null, false), member: communityAccessFrom({ privacy: "public" }, m("member"), false), admin: communityAccessFrom({ privacy: "public" }, m("admin"), false) };
assert.equal(canSeeChannel(open, pub.signedOut), true); assert.equal(canPostInChannel(open, pub.signedOut), false);
assert.equal(canPostInChannel(open, pub.member), true);
assert.equal(canPostInChannel(news, pub.member), false); assert.equal(canPostInChannel(news, pub.admin), true);
assert.equal(canSeeChannel(staff, pub.member), false); assert.equal(canSeeChannel(staff, pub.admin), true);
const priv = communityAccessFrom({ privacy: "private" }, null, false);
assert.equal(canSeeChannel(open, priv), false); // private community: outsiders see nothing
const banned = communityAccessFrom({ privacy: "public" }, m("member", "banned"), false);
assert.equal(canPostInChannel(open, banned), false);

// Private ("invite") channels: guests and managers only; everyone else gets nothing.
const room = { visibility: "invite", type: "text" } as const;
assert.equal(canSeeChannel(room, pub.member, false), false); assert.equal(canSeeChannel(room, pub.member, true), true);
assert.equal(canSeeChannel(room, pub.admin, false), true); // owners/admins of the space always can
assert.equal(canPostInChannel(room, pub.member, true), true); assert.equal(canPostInChannel(room, pub.member, false), false);
assert.equal(canSeeChannel(room, communityAccessFrom({ privacy: "private" }, null, false), true), false);

// A group's channels follow the GROUP access: parent membership alone doesn't open a private group's rooms.
const inPrivateGroup = subAccessFrom({ visibility: "private" }, m("member"), m("member"));
const outsideGroup = subAccessFrom({ visibility: "private" }, m("admin"), null);
assert.equal(canSeeChannel(open, inPrivateGroup), true); assert.equal(canPostInChannel(open, inPrivateGroup), true);
assert.equal(canSeeChannel(open, outsideGroup), false); assert.equal(canSeeChannel(room, outsideGroup, true), false);
assert.equal(canSeeChannel(staff, inPrivateGroup), false); // a plain group member can't see the group's staff room

// Who may start a group.
const memberAcc = { isMember: true, canManage: false }, adminAcc = { isMember: true, canManage: true }, outsider = { isMember: false, canManage: false };
assert.equal(canCreateGroup({ groupPolicy: "admins" }, adminAcc), true); assert.equal(canCreateGroup({ groupPolicy: "admins" }, memberAcc), false);
assert.equal(canCreateGroup({ groupPolicy: "members" }, memberAcc), true); assert.equal(canCreateGroup({ groupPolicy: "members" }, outsider), false);
assert.equal(canCreateGroup({ groupPolicy: "off" }, adminAcc), false);

console.log("All policy checks passed.");
