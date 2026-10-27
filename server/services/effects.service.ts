import "server-only";
import type { z } from "zod";
import type { ProfileEffectDTO } from "@/lib/types";
import { ApiError, conflict, notFound } from "../http/errors";
import { AppSetting } from "../models/AppSetting";
import { ProfileEffect, type IProfileEffect } from "../models/ProfileEffect";
import { User } from "../models/User";
import type { profileEffectSchema } from "../validators/schemas";
import { getWalletConfig } from "./wallet.service";

/**
 * Profile effects (models/ProfileEffect): the catalogue people pick from, and the site admins' side (add, change,
 * hide, remove). An effect's Hype price is kept with the other design prices, so unlocking works like any design.
 */

const dto = (e: IProfileEffect, prices: Record<string, number>, fallback: number): ProfileEffectDTO => ({
  id: e.slug,
  name: e.name,
  kind: e.kind,
  fileUrl: e.fileUrl,
  posterFrame: e.posterFrame ?? 0.5,
  active: e.active,
  price: prices[`effect:${e.slug}`] ?? fallback,
});

/** What people can pick (active), or everything (site admins). */
export async function listEffects(all = false): Promise<ProfileEffectDTO[]> {
  const [rows, c] = await Promise.all([ProfileEffect.find(all ? {} : { active: true }).sort({ position: 1, createdAt: 1 }).lean<IProfileEffect[]>(), getWalletConfig()]);
  return rows.map((e) => dto(e, c.prices, c.defaultPrice.effect));
}

/** An effect someone may put on now (it exists and isn't hidden). */
export async function assertEffectAvailable(slug: string) {
  if (!(await ProfileEffect.exists({ slug, active: true }))) throw new ApiError(422, "That profile effect isn't available.", { errors: { profileEffect: "Not available" } });
}

async function setPrice(slug: string, price: number | null | undefined) {
  if (price === undefined) return;
  const key = `prices.effect:${slug}`;
  await AppSetting.updateOne({ _id: "walletConfig" }, price === null ? { $unset: { [`value.${key}`]: 1 } } : { $set: { [`value.${key}`]: price } }, { upsert: true });
}

export async function saveEffect(input: z.infer<typeof profileEffectSchema>, slug?: string): Promise<ProfileEffectDTO> {
  const set = { name: input.name, kind: "lottie" as const, fileUrl: input.fileUrl, posterFrame: input.posterFrame ?? 0.5, active: input.active ?? true };
  if (slug) {
    const e = await ProfileEffect.findOneAndUpdate({ slug }, { $set: set }, { returnDocument: "after" }).lean<IProfileEffect>();
    if (!e) throw notFound("We couldn't find that effect.");
    await setPrice(slug, input.price);
    return (await listEffects(true)).find((x) => x.id === slug)!;
  }
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "effect";
  let s = base;
  for (let i = 2; await ProfileEffect.exists({ slug: s }); i++) s = `${base}-${i}`;
  await ProfileEffect.create({ ...set, slug: s, position: (await ProfileEffect.countDocuments()) + 1 });
  await setPrice(s, input.price);
  return (await listEffects(true)).find((x) => x.id === s)!;
}

/** Remove an effect nobody is wearing (hide it instead while people are). */
export async function deleteEffect(slug: string) {
  if (await User.exists({ profileEffect: slug })) throw conflict("People are wearing this effect. Hide it instead: they keep it until their unlock ends.");
  const r = await ProfileEffect.deleteOne({ slug });
  if (!r.deletedCount) throw notFound("We couldn't find that effect.");
  await setPrice(slug, null);
  return { deleted: true };
}
