"use client";

import { useEffect, useState } from "react";
import { isApiError } from "@/app/ApiCore";
import type { CommunityInput } from "@/app/services/CommunityService";
import { Button } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { ImageField } from "@/components/ui/ImageField";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { INTERESTS, LIMITS, isInterestId, type InterestId } from "@/lib/constants";
import type { CommunityPrivacy } from "@/lib/types";

export interface CommunityFormValues {
  name: string;
  description: string;
  interest: InterestId;
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  privacy: CommunityPrivacy;
  coverImage: string;
}

/** Create / edit form for a community. `onSubmit` should throw on failure; field errors from the API are shown inline. */
export function CommunityForm({
  initial,
  submitLabel,
  showPrivacy,
  onSubmit,
  embedded,
}: {
  initial?: Partial<CommunityFormValues>;
  submitLabel: string;
  showPrivacy?: boolean;
  onSubmit: (input: CommunityInput) => Promise<void>;
  /** inside settings: no submit button; the page's "unsaved changes" bar submits the form with this id */
  embedded?: { formId: string; onDirty: (dirty: boolean) => void; onBusy?: (busy: boolean) => void };
}) {
  const [v, setV] = useState<CommunityFormValues>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    interest: initial?.interest ?? INTERESTS[0].id,
    country: initial?.country ?? "NG",
    region: initial?.region ?? "lagos",
    city: initial?.city ?? "lagos",
    neighborhood: initial?.neighborhood ?? "",
    privacy: initial?.privacy ?? "public",
    coverImage: initial?.coverImage ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [start] = useState(() => JSON.stringify(v));
  const onDirty = embedded?.onDirty;
  const onBusy = embedded?.onBusy;
  useEffect(() => onDirty?.(JSON.stringify(v) !== start), [v, start, onDirty]);
  useEffect(() => onBusy?.(busy), [busy, onBusy]);
  const set = <K extends keyof CommunityFormValues>(k: K, val: CommunityFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral(null);
    try {
      await onSubmit({
        name: v.name.trim(),
        description: v.description.trim(),
        interest: v.interest,
        country: v.country,
        region: v.region,
        city: v.city,
        neighborhood: v.neighborhood.trim(),
        ...(showPrivacy ? { privacy: v.privacy } : {}),
        coverImage: v.coverImage.trim() || null,
      });
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      setGeneral(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={embedded?.formId} onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={LIMITS.communityName} required error={errors.name} placeholder="Lekki Skate Crew" />
      <TextArea label="Description" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={LIMITS.communityDescription} counter={LIMITS.communityDescription} error={errors.description} placeholder="Who is this for and what do you do together?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Interest" value={v.interest} onChange={(e) => isInterestId(e.target.value) && set("interest", e.target.value)} error={errors.interest}>
          {INTERESTS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </SelectField>
      </div>
      <PlaceFields value={{ country: v.country, region: v.region, city: v.city }} onChange={(p) => setV((x) => ({ ...x, ...p }))} neighborhood={v.neighborhood} onNeighborhood={(n) => set("neighborhood", n)} errors={errors} />

      {showPrivacy && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">Who can join?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["public", "Public", "Anyone can find it, see posts and events, and join instantly."],
                ["private", "Private", "Anyone can find it, but only members see posts, events and members. People request to join (or use an invite link) and you approve."],
              ] as const
            ).map(([id, title, hint]) => (
              <label key={id} className="flex cursor-pointer gap-3 rounded-control border border-line bg-raised p-3.5 has-[:checked]:border-accent-text has-[:checked]:bg-surface">
                <input type="radio" name="privacy" value={id} checked={v.privacy === id} onChange={() => set("privacy", id)} className="mt-1 accent-[var(--accent-text)]" />
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.privacy && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {errors.privacy}
            </p>
          )}
        </fieldset>
      )}

      <ImageField kind="photo" label="Cover image (optional)" value={v.coverImage} onChange={(u) => set("coverImage", u)} error={errors.coverImage} hint="A wide picture. We'll use artwork if you skip it." />

      {general && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm font-medium text-danger">
          {general}
        </p>
      )}
      {!embedded && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
