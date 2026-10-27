import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A profile effect: an animation that plays over someone's profile card, a Lottie JSON uploaded by a site admin.
 * When it isn't playing (picker tiles, animations off, data saver) it waits on `posterFrame`. People
 * unlock one with Hype (its price lives with the other design prices, key "effect:<slug>").
 */
export interface IProfileEffect {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  /** "image" (an animated WebP/APNG) only on effects added before they became Lottie only */
  kind: "image" | "lottie";
  fileUrl: string;
  /** a still picture, from before effects became Lottie only: no longer used */
  previewUrl: string;
  /** where a Lottie pauses when it isn't playing, 0 (start) to 1 (end) */
  posterFrame: number;
  /** hidden effects can't be picked; people already wearing one keep it until their unlock ends */
  active: boolean;
  position: number;
  createdAt: Date;
}

const ProfileEffectSchema = new Schema<IProfileEffect>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    kind: { type: String, enum: ["image", "lottie"], required: true },
    fileUrl: { type: String, required: true, maxlength: 1000 },
    previewUrl: { type: String, default: "", maxlength: 1000 },
    posterFrame: { type: Number, default: 0.5, min: 0, max: 1 },
    active: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ProfileEffectSchema.index({ active: 1, position: 1 });

export const ProfileEffect: Model<IProfileEffect> = defineModel<IProfileEffect>("ProfileEffect", ProfileEffectSchema);
