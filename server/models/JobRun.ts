import { Schema, model, models, type Model } from "mongoose";

/** When a background job last ran, so several servers don't run it at the same time. `_id` is the job name. */
export interface IJobRun {
  _id: string;
  lastRunAt: Date;
}

const JobRunSchema = new Schema<IJobRun>({ _id: { type: String, required: true }, lastRunAt: { type: Date, required: true } }, { versionKey: false });

export const JobRun: Model<IJobRun> = (models.JobRun as Model<IJobRun>) || model<IJobRun>("JobRun", JobRunSchema);
