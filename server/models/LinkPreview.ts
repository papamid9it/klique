import { Schema, model, models, type Model } from "mongoose";

/** Cached OpenGraph data for a URL (so a popular link is fetched once, not once per viewer). */
export interface ILinkPreview {
  urlHash: string;
  url: string;
  ok: boolean;
  siteName: string;
  title: string;
  description: string;
  image: string | null;
  /** direct video file (mp4/webm) advertised by the page */
  videoUrl: string | null;
  fetchedAt: Date;
}

const LinkPreviewSchema = new Schema<ILinkPreview>({
  urlHash: { type: String, required: true, unique: true },
  url: { type: String, required: true, maxlength: 2000 },
  ok: { type: Boolean, default: true },
  siteName: { type: String, default: "", maxlength: 120 },
  title: { type: String, default: "", maxlength: 300 },
  description: { type: String, default: "", maxlength: 500 },
  image: { type: String, default: null },
  videoUrl: { type: String, default: null },
  // Entries expire on their own: a day for hits, failures are retried sooner (see the service).
  fetchedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

export const LinkPreview: Model<ILinkPreview> =
  (models.LinkPreview as Model<ILinkPreview>) || model<ILinkPreview>("LinkPreview", LinkPreviewSchema);
