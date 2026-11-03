import "server-only";
import type { z } from "zod";
import type { EntryAnswer, ScreeningDTO } from "@/lib/types";
import { badRequest } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { assertCanManage, type Space, type SpaceAccess } from "../policies/access";
import type { screeningSchema } from "../validators/schemas";

/**
 * Entry questions, like a membership screening: a community's owner and admins write up to 5 (a short answer, one
 * of a few choices, or an "I agree to the rules" box; each required or not) and switch them on. Then anyone joining
 * answers first: a public community lets them in right after (the answers are kept with their membership), a private
 * one sends the answers with the join request. Changing the questions never touches people already in.
 * (Groups don't have them: nobody asks to join a group, its admins add people.)
 */

export const screeningOf = (c: Pick<ICommunity, "screening">): ScreeningDTO => ({
  enabled: !!c.screening?.enabled && (c.screening?.questions?.length ?? 0) > 0,
  questions: (c.screening?.questions ?? []).map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, options: q.options ?? [], required: q.required !== false })),
});

/** The questions, for anyone who can see the community (to answer them before joining). */
export function getScreening(space: Space): ScreeningDTO {
  // a private community's questions are shown too: they're what people answer to ask to join
  return screeningOf(space.community);
}

/** Owners and admins: save the questions and the switch. */
export async function setScreening(space: Space, access: SpaceAccess, input: z.infer<typeof screeningSchema>): Promise<ScreeningDTO> {
  assertCanManage(access);
  if (space.sub) throw badRequest("Groups don't have entry questions.");
  const ids = new Set<string>();
  for (const q of input.questions) {
    if (ids.has(q.id)) throw badRequest("Two questions have the same id.");
    ids.add(q.id);
    if (q.kind === "choice" && q.options.length < 2) throw badRequest(`Give "${q.prompt}" at least 2 choices.`);
  }
  if (input.enabled && !input.questions.length) throw badRequest("Add at least one question before switching them on.");
  const screening = { enabled: input.enabled, questions: input.questions.map((q) => ({ ...q, options: q.kind === "choice" ? q.options : [] })) };
  await Community.updateOne({ _id: space.community._id }, { $set: { screening } });
  return screeningOf({ screening });
}

/**
 * Check someone's answers against the questions (when they're on): every required one answered, a choice one of
 * the choices, "I agree" ticked. Returns them as what each question said and what they answered, to keep.
 */
export function checkAnswers(c: Pick<ICommunity, "screening">, given: Record<string, string | boolean> | undefined): EntryAnswer[] {
  const s = screeningOf(c);
  if (!s.enabled) return [];
  const out: EntryAnswer[] = [];
  for (const q of s.questions) {
    const v = given?.[q.id];
    if (q.kind === "agree") {
      if (v !== true && q.required) throw badRequest(`Please tick "${q.prompt}" to join.`);
      if (v === true) out.push({ prompt: q.prompt, answer: "Agreed" });
      continue;
    }
    const text = typeof v === "string" ? v.trim() : "";
    if (!text) {
      if (q.required) throw badRequest(`Please answer "${q.prompt}" to join.`);
      continue;
    }
    if (q.kind === "choice" && !q.options.includes(text)) throw badRequest(`Pick one of the choices for "${q.prompt}".`);
    out.push({ prompt: q.prompt, answer: text.slice(0, 500) });
  }
  return out;
}
