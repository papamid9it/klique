import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A picture someone saved as a sticker (WhatsApp-style). Only a reference: the file is the upload that was
 * already posted (or the one they uploaded as a sticker), so saving costs no storage. Kept on the account so the
 * same stickers show on every device. While any row points at a file, deleting the original message keeps the
 * file (see media.service).
 */
export interface ISavedSticker {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** the picture itself (one of our uploads, or a bundled /mock file in development) */
  url: string;
  /** lower comes first in the picker */
  order: number;
  /** how often its owner sent it, and when last: drives the "Most used" row */
  uses?: number;
  lastUsedAt?: Date | null;
  createdAt: Date;
}

const SavedStickerSchema = new Schema<ISavedSticker>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    url: { type: String, required: true, maxlength: 600 },
    order: { type: Number, default: 0 },
    uses: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SavedStickerSchema.index({ userId: 1, url: 1 }, { unique: true });
SavedStickerSchema.index({ userId: 1, order: 1 });
SavedStickerSchema.index({ url: 1 });

export const SavedSticker: Model<ISavedSticker> = defineModel<ISavedSticker>("SavedSticker", SavedStickerSchema);
