import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A profile effect: an animation that plays over someone's profile card, uploaded by a site admin (an animated WebP
 * or APNG with transparency, or a Lottie JSON), with a still picture for people who want things still. People
 * unlock one with Hype (its price lives with the other design prices, key "effect:<slug>").
 */
export interface IProfileEffect {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  kind: "image" | "lottie";
  fileUrl: string;
  previewUrl: string;
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
    previewUrl: { type: String, required: true, maxlength: 1000 },
    active: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ProfileEffectSchema.index({ active: 1, position: 1 });

export const ProfileEffect: Model<IProfileEffect> = defineModel<IProfileEffect>("ProfileEffect", ProfileEffectSchema);
