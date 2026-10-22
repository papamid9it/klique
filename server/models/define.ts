import { deleteModel, model, models, type Model, type Schema } from "mongoose";

/** What a schema stores: every field, its type and allowed values. Two schemas with the same shape match. */
function shape(schema: Schema): string {
  return Object.entries(schema.paths)
    .map(([p, t]) => `${p}:${t.instance}:${JSON.stringify((t as { enumValues?: unknown[] }).enumValues ?? (t.options as { enum?: unknown })?.enum ?? "")}`)
    .sort()
    .join("|");
}

/**
 * Register a model once, but never keep a stale one: in development a hot reload re-runs the model file with the
 * new schema while mongoose still holds the old model, and the old one silently drops fields added since (they
 * "save" but never reach the database) or refuses new allowed values. When the schema changed, it's rebuilt.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  if (existing) {
    if (existing.schema === schema || shape(existing.schema) === shape(schema)) return existing;
    deleteModel(name);
  }
  return model<T>(name, schema);
}
