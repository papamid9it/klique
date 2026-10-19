import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IPost {
  _id: Types.ObjectId;
  communityId: Types.ObjectId;
  subcommunityId: Types.ObjectId | null;
  authorId: Types.ObjectId;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true },
    subcommunityId: { type: Schema.Types.ObjectId, ref: "Subcommunity", default: null },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 1500 },
    imageUrl: { type: String, default: null },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true },
);

PostSchema.index({ communityId: 1, subcommunityId: 1, pinned: -1, createdAt: -1 });

export const Post: Model<IPost> = (models.Post as Model<IPost>) || model<IPost>("Post", PostSchema);
