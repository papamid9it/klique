import { Schema, model, models, type Model } from "mongoose";

/**
 * One upload this server handed out a link for (its files' keys in R2). The nightly sweep only ever looks at these:
 * the bucket is shared with other copies of the site (dev, a preview), so files another one made are never
 * touched. Once the sweep has seen an upload in use it drops the row; one nobody used after a day is deleted.
 */
export interface IUploadLog {
  _id: string;
  keys: string[];
  createdAt: Date;
}

const UploadLogSchema = new Schema<IUploadLog>(
  {
    // the upload's base key ("klique/photos/2026-11/abc")
    _id: { type: String, required: true },
    keys: { type: [String], default: [] },
    createdAt: { type: Date, default: () => new Date(), index: true },
  },
  { versionKey: false },
);

export const UploadLog: Model<IUploadLog> = (models.UploadLog as Model<IUploadLog>) || model<IUploadLog>("UploadLog", UploadLogSchema);
