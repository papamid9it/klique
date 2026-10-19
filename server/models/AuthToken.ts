import { Schema, model, models, type Model, type Types } from "mongoose";

export const TOKEN_KINDS = ["verify", "reset", "app"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export interface IAuthToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: TokenKind;
  /** sha256 of the emailed token; the token itself is never stored */
  tokenHash: string;
  expiresAt: Date;
  /** "app" codes: sha256 of the PKCE verifier the mobile app must present to redeem it */
  meta?: string;
}

const AuthTokenSchema = new Schema<IAuthToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: TOKEN_KINDS, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    meta: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// MongoDB removes expired rows by itself.
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthToken: Model<IAuthToken> = (models.AuthToken as Model<IAuthToken>) || model<IAuthToken>("AuthToken", AuthTokenSchema);
