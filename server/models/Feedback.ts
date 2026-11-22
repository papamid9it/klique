import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * What someone sent from "Help & feedback" (the apps' Settings): feedback, a problem, or a child safety concern
 * (Google Play's Child Safety Standards ask for an in-app way to send these without leaving the app). Read and
 * closed by site admins in Admin → Feedback; safety concerns alert them at once.
 */
export interface IFeedback {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: "feedback" | "problem" | "safety";
  message: string;
  /** where it came from ("android 1.0.1", "web") */
  source: string;
  doneAt: Date | null;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["feedback", "problem", "safety"], required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    source: { type: String, default: "", maxlength: 60 },
    doneAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

FeedbackSchema.index({ doneAt: 1, createdAt: -1 });

export const Feedback: Model<IFeedback> = defineModel<IFeedback>("Feedback", FeedbackSchema);
