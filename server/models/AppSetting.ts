import { Schema, model, models, type Model } from "mongoose";

/** Settings a site admin changes from the admin console (ad prices…), one document per key. */
export interface IAppSetting {
  _id: string;
  value: unknown;
  updatedAt: Date;
}

const AppSettingSchema = new Schema<IAppSetting>({ _id: { type: String }, value: { type: Schema.Types.Mixed } }, { timestamps: { createdAt: false, updatedAt: true } });

export const AppSetting: Model<IAppSetting> = (models.AppSetting as Model<IAppSetting>) || model<IAppSetting>("AppSetting", AppSettingSchema);
