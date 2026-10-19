"use client";

import { useState } from "react";
import { isApiError } from "@/app/ApiCore";
import type { CommunityInput } from "@/app/services/CommunityService";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { Button } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { ImageField } from "@/components/ui/ImageField";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { INTERESTS, LIMITS, isInterestId, type InterestId } from "@/lib/constants";
import type { CommunityPrivacy } from "@/lib/types";

const STEPS = ["Who can join", "About it", "Where it is"] as const;

/**
 * Discord's "Create your server" flow as three short steps: who can join, the basics, and where it is.
 * `onSubmit` should throw on failure; field errors from the API send you back to the step that has them.
 */
export function CommunityWizard({ onSubmit }: { onSubmit: (input: CommunityInput) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [privacy, setPrivacy] = useState<CommunityPrivacy>("public");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [interest, setInterest] = useState<InterestId>(INTERESTS[0].id);
  const [coverImage, setCoverImage] = useState("");
  const [place, setPlace] = useState({ country: "NG", region: "lagos", city: "lagos" });
  const [neighborhood, setNeighborhood] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setErrors({});
    setGeneral(null);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), interest, ...place, neighborhood: neighborhood.trim(), privacy, coverImage: coverImage.trim() || null });
    } catch (err) {
      if (isApiError(err) && err.errors) {
        setErrors(err.errors);
        if (err.errors.name || err.errors.description || err.errors.interest || err.errors.coverImage) setStep(1);
      }
      setGeneral(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const initial = (name.trim() || "k").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-[34rem] overflow-hidden rounded-card border border-line bg-surface shadow-2xl">
      <div className="px-6 pt-7 text-center sm:px-9">
        <ol className="mb-5 flex items-center justify-center gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={cx("h-1.5 rounded-full transition-all", i === step ? "w-8 bg-accent" : i < step ? "w-4 bg-accent/60" : "w-4 bg-line")}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
        <h2 className="text-[26px] leading-tight font-bold tracking-[-0.03em]">{step === 0 ? "Create your community" : step === 1 ? "Tell us about it" : "Where is it based?"}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          {step === 0 ? "A community is where your people hang out: channels to chat, events to show up to. Who is it for?" : step === 1 ? "Give it a name and a face. You can change all of this later in settings." : "People nearby find you by place. Online-only? Pick where your core crew lives."}
        </p>
      </div>

      <div className="px-6 py-6 sm:px-9">
        {step === 0 && (
          <div className="space-y-2.5">
            {(
              [
                ["public", "globe", "Open to everyone", "Anyone can find it, read it and join straight away."],
                ["private", "lock", "By approval or invite", "Anyone can find it, but only members see inside. You approve requests or share invite links."],
              ] as const
            ).map(([id, icon, title, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPrivacy(id);
                  setStep(1);
                }}
                className={cx("flex w-full items-center gap-4 rounded-control border bg-raised p-4 text-left transition hover:bg-canvas", privacy === id ? "border-accent-text" : "border-line")}
              >
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-accent-text">
                  <Icon name={icon} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{title}</span>
                  <span className="block text-[13px] text-ink-muted">{hint}</span>
                </span>
                <Icon name="chevron-right" size={18} className="shrink-0 text-ink-muted" />
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <ImageField kind="photo" label="Cover image (optional)" value={coverImage} onChange={setCoverImage} error={errors.coverImage} fallback={<span className="text-lg font-bold text-ink-muted">{initial}</span>} />
            <TextField label="Community name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.communityName} required autoFocus error={errors.name} placeholder="Lekki Skate Crew" />
            <SelectField label="What's it about?" value={interest} onChange={(e) => isInterestId(e.target.value) && setInterest(e.target.value)} error={errors.interest}>
              {INTERESTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </SelectField>
            <TextArea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.communityDescription} counter={LIMITS.communityDescription} error={errors.description} placeholder="Who is this for and what do you do together?" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <PlaceFields value={place} onChange={(p) => setPlace((x) => ({ ...x, ...p }))} neighborhood={neighborhood} onNeighborhood={setNeighborhood} errors={errors} />
            {general && (
              <p role="alert" className="text-sm font-medium text-danger">
                {general}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-raised/50 px-6 py-4 sm:px-9">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <Icon name="arrow-left" size={14} /> Back
          </Button>
        ) : (
          <Button variant="ghost" href="/communities">
            Cancel
          </Button>
        )}
        {step === 1 && (
          <Button variant="primary" onClick={() => setStep(2)} disabled={name.trim().length < 2}>
            Next
          </Button>
        )}
        {step === 2 && (
          <Button variant="primary" onClick={() => void create()} loading={busy}>
            Create community
          </Button>
        )}
      </div>
    </div>
  );
}
