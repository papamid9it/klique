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
  type Place,
} from "@/lib/places";

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
}: {
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

      {regions.length > 0 ? (
        <SelectField label={REGION_KIND[value.country] ?? "Region"} value={value.region} onChange={(e) => setRegion(e.target.value)} error={errors?.region} disabled={disabled}>
          <option value="">Choose…</option>
          {regions.map((r) => (
            <option key={r.slug} value={r.slug}>{r.name}</option>
          ))}
        </SelectField>
      ) : (
        <div className="hidden sm:block" />
      )}

      <div>
        <TextField label="City or town" value={text} onChange={(e) => typeCity(e.target.value)} list={listId} placeholder="Start typing…" error={errors?.city} disabled={disabled} autoComplete="off" maxLength={40} />
        <datalist id={listId}>
          {suggestions.map((c) => (
            <option key={c.slug} value={c.name} />
          ))}
        </datalist>
      </div>

      {onNeighborhood && (
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

/** The state a known city belongs to, for forms that only collect a city. */
export const regionOfCity = (country: string, city: string) => getCityEntry(country, city)?.region ?? "";
export { currencyOf };
