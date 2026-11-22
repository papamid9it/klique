"use client";

import { useId, useState } from "react";
import { SelectField, TextField } from "@/components/ui/Field";
import {
  CONTINENTS,
  cityName,
  citiesIn,
  countriesOf,
  currencyOf,
  getCityEntry,
  neighborhoodsOf,
  REGION_KIND,
  regionsOf,
  slugify,
  getCountry,
  placeForReach,
  reachOf,
  REACHES,
  type Place,
  type Reach,
} from "@/lib/places";
import { cx } from "@/components/ui/cx";

/**
 * Country · state · city (and an optional neighbourhood). The city can be any town: pick a suggestion
 * or just type it. Used wherever something has a location: sign-up, profile, communities and events.
 */
export function PlaceFields({
  value,
  onChange,
  errors,
  neighborhood,
  onNeighborhood,
  disabled,
  upTo = "city",
}: {
  /** how deep to ask: just the country, the country and state, or down to the city (the default) */
  upTo?: "country" | "region" | "city";
  value: Place;
  onChange: (p: Place) => void;
  errors?: Partial<Record<"country" | "region" | "city" | "neighborhood", string>>;
  neighborhood?: string;
  onNeighborhood?: (n: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const nbId = useId();
  const [text, setText] = useState(value.city ? cityName(value.country, value.city) : "");
  const regions = regionsOf(value.country);
  const suggestions = citiesIn(value.country, value.region || undefined);
  const hoods = neighborhoodsOf(value.country, value.city);

  function setCountry(code: string) {
    setText("");
    onChange({ country: code, region: "", city: "" });
  }
  function setRegion(region: string) {
    onChange({ ...value, region });
  }
  function typeCity(raw: string) {
    setText(raw);
    const known = citiesIn(value.country).find((c) => c.name.toLowerCase() === raw.trim().toLowerCase());
    if (known) onChange({ country: value.country, region: known.region ?? value.region, city: known.slug });
    else onChange({ ...value, city: slugify(raw) });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Country" value={value.country} onChange={(e) => setCountry(e.target.value)} error={errors?.country} disabled={disabled}>
        {CONTINENTS.map((ct) => (
          <optgroup key={ct.id} label={ct.name}>
            {countriesOf(ct.id).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      {upTo === "country" ? null : regions.length > 0 ? (
        <SelectField label={REGION_KIND[value.country] ?? "Region"} value={value.region} onChange={(e) => setRegion(e.target.value)} error={errors?.region} disabled={disabled}>
          <option value="">Choose…</option>
          {regions.map((r) => (
            <option key={r.slug} value={r.slug}>{r.name}</option>
          ))}
        </SelectField>
      ) : (
        <div className="hidden sm:block" />
      )}

      {upTo === "city" && (
      <div>
        <TextField label="City or town" value={text} onChange={(e) => typeCity(e.target.value)} list={listId} placeholder="Start typing…" error={errors?.city} disabled={disabled} autoComplete="off" maxLength={40} />
        <datalist id={listId}>
          {suggestions.map((c) => (
            <option key={c.slug} value={c.name} />
          ))}
        </datalist>
      </div>
      )}

      {onNeighborhood && upTo === "city" && (
        <div>
          <TextField label="Neighbourhood (optional)" id={nbId} value={neighborhood ?? ""} onChange={(e) => onNeighborhood(e.target.value)} list={`${nbId}-l`} maxLength={60} placeholder={hoods[0] ? `e.g. ${hoods[0]}` : "Area or district"} error={errors?.neighborhood} disabled={disabled} autoComplete="off" />
          <datalist id={`${nbId}-l`}>
            {hoods.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}

/** A community's place, as wide as it wants: a city, a state, a country, a continent or worldwide (lib/places reach). */
export type ReachValue = Place & { continent: string; reach: Reach };
export function ReachFields({
  value,
  onChange,
  errors,
  neighborhood,
  onNeighborhood,
  label = "Where it's for",
  hint,
}: {
  value: ReachValue;
  onChange: (p: ReachValue) => void;
  errors?: Partial<Record<"country" | "region" | "city" | "continent" | "neighborhood", string>>;
  neighborhood?: string;
  onNeighborhood?: (n: string) => void;
  /** what to call it and what each choice means (a klique: "Where it is", and who finds it) */
  label?: string;
  hint?: (r: Reach) => string;
}) {
  const reach = value.reach;
  // switching keeps what it can: the country you had, its continent, your state and city
  const [last, setLast] = useState<Place>(value.country ? value : { country: "NG", region: "", city: "" });
  const pick = (r: Reach) => {
    const next = placeForReach(r, { ...last, continent: value.continent || (getCountry(last.country)?.continent ?? "africa") });
    onChange({ ...next, reach: r });
  };
  const place = (p: Place) => {
    setLast(p);
    onChange({ ...placeForReach(reach, { ...p, continent: "" }), reach });
  };
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium">{label}</p>
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
          {REACHES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={reach === r.id} onClick={() => pick(r.id)} className={cx("h-9 rounded-full border px-3.5 text-sm font-semibold transition", reach === r.id ? "border-ink bg-ink text-canvas" : "border-line text-ink hover:bg-raised")}>
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {hint ? hint(reach) : reach === "world" ? "People anywhere find it in Discover." : reach === "continent" ? "People across the continent find it." : reach === "country" ? "People anywhere in the country find it." : reach === "region" ? "People across the state find it." : "People in and around the city find it first."}
        </p>
      </div>
      {reach === "continent" ? (
        <SelectField label="Continent" value={value.continent} onChange={(e) => onChange({ country: "", region: "", city: "", continent: e.target.value, reach })} error={errors?.continent}>
          {CONTINENTS.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
        </SelectField>
      ) : reach !== "world" ? (
        <PlaceFields value={value} onChange={place} errors={errors} upTo={reach === "country" ? "country" : reach === "region" ? "region" : "city"} neighborhood={neighborhood} onNeighborhood={onNeighborhood} />
      ) : null}
    </div>
  );
}

/** A saved community's place as the picker's value (its reach read from which fields it has). */
export const reachValueOf = (p: { country?: string | null; region?: string | null; city?: string | null; continent?: string | null }): ReachValue => ({
  country: p.country ?? "",
  region: p.region ?? "",
  city: p.city ?? "",
  continent: p.continent ?? "",
  reach: reachOf(p),
});

/** The state a known city belongs to, for forms that only collect a city. */
export const regionOfCity = (country: string, city: string) => getCityEntry(country, city)?.region ?? "";
export { currencyOf };
