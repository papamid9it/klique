import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import type { UserBrief } from "@/lib/types";
import { badRequest, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { adminEmails } from "../env";
import { Feedback, type IFeedback } from "../models/Feedback";
import { User, type IUser } from "../models/User";
import { GHOST, loadBriefs } from "../serializers";
import { sid } from "./helpers";
import { notify } from "./push.service";

export const feedbackSchema = z.object({
  kind: z.enum(["feedback", "problem", "safety"]),
  message: z.string().trim().min(3, "Write a few words.").max(2000),
  source: z.string().trim().max(60).default(""),
});

export interface FeedbackDTO {
  id: string;
  kind: IFeedback["kind"];
  message: string;
  source: string;
  user: UserBrief;
  createdAt: string;
  done: boolean;
}

const LABEL: Record<IFeedback["kind"], string> = { feedback: "Feedback", problem: "A problem", safety: "Child safety concern" };

/** Someone sends feedback from the app (a few a day at most); site admins hear about it, a safety concern at once. */
export async function submitFeedback(viewer: IUser, input: z.infer<typeof feedbackSchema>): Promise<{ sent: true }> {
  rateLimit(`feedback:${sid(viewer._id)}`, 10, 24 * 60 * 60_000);
  if (!input.message.trim()) throw badRequest("Write a few words.");
  const doc = await Feedback.create({ userId: viewer._id, kind: input.kind, message: input.message, source: input.source });
  const admins = await User.find({ email: { $in: [...adminEmails()] } }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  if (admins.length) {
    notify(
      admins.map((a) => a._id),
      { title: input.kind === "safety" ? "Urgent: child safety concern" : `${LABEL[input.kind]} from @${viewer.handle}`, body: input.message.slice(0, 140), data: { href: "/admin/feedback" } },
      { category: "admin", ref: `feedback:${sid(doc._id)}` },
    );
  }
  return { sent: true };
}

/** Admin → Feedback: open ones first (safety concerns on top), newest first; or the closed ones. */
export async function listFeedback(done: boolean): Promise<FeedbackDTO[]> {
  const rows = await Feedback.find({ doneAt: done ? { $ne: null } : null }).sort({ createdAt: -1 }).limit(200).lean<IFeedback[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  const list = rows.map((r) => ({ id: sid(r._id), kind: r.kind, message: r.message, source: r.source, user: briefs.get(sid(r.userId)) ?? { ...GHOST, id: sid(r.userId) }, createdAt: r.createdAt.toISOString(), done: !!r.doneAt }));
  return done ? list : [...list.filter((x) => x.kind === "safety"), ...list.filter((x) => x.kind !== "safety")];
}

export async function closeFeedback(id: string, done: boolean): Promise<{ done: boolean }> {
  if (!Types.ObjectId.isValid(id)) throw notFound("That isn't here.");
  const r = await Feedback.updateOne({ _id: id }, { $set: { doneAt: done ? new Date() : null } });
  if (!r.matchedCount) throw notFound("That isn't here.");
  return { done };
}
