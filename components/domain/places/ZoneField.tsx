"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui/Field";
import { deviceZone, yourTime, zoneCity, zoneFitsCountry, zoneForPlace, zoneLabel, zonesOf } from "@/lib/timezones";

export { zoneCity };

/**
 * The zone an event's or klique's times are typed in: the place's (a known city's, or the host's own device zone
 * when it's one of the country's), unless the host picked another of the country's zones. `initial` keeps an
 * existing one while editing.
 */
export function usePlaceZone(place: { country?: string | null; city?: string | null }, initial?: string | null) {
  // the device zone is only read in the browser, so the first render matches the server's
  const [device, setDevice] = useState<string | undefined>(undefined);
  useEffect(() => setDevice(deviceZone()), []);
  const [pick, setPick] = useState<string | null>(initial ?? null);
  const zone = pick && zoneFitsCountry(pick, place.country) ? pick : zoneForPlace(place, device);
  return { zone, choices: zonesOf(place.country), setZone: setPick };
}

/** Which time zone the times are in: one line, or a choice in a country with more than one. */
export function ZoneField({ zone, choices, onChange }: { zone: string; choices: string[]; onChange: (zone: string) => void }) {
  if (choices.length < 2) {
    return <p className="-mt-3 text-xs text-ink-muted">Times are in {zoneCity(zone)} time ({zoneLabel(zone)}).</p>;
  }
  const list = choices.includes(zone) ? choices : [zone, ...choices];
  return (
    <SelectField label="Time zone" value={zone} onChange={(e) => onChange(e.target.value)}>
      {list.map((z) => (
        <option key={z} value={z}>
          {zoneCity(z)} ({zoneLabel(z)})
        </option>
      ))}
    </SelectField>
  );
}

/**
 * " · 2:00 AM your time" (with the day when it's another one) under an event's or klique's own time, when your
 * device is in another zone. Only in the browser, so the server's page and the first render match.
 */
export function useYourTime(iso: string | null | undefined, zone: string | null | undefined): string {
  const [device, setDevice] = useState<string | undefined>(undefined);
  useEffect(() => setDevice(deviceZone()), []);
  return yourTime(iso, zone, device);
}

/** A muted line with the time on your own clock, when your device is in another zone (event and klique pages). */
export function YourTime({ iso, zone, className }: { iso: string; zone: string; className?: string }) {
  const text = useYourTime(iso, zone);
  return text ? <span className={className ?? "block text-xs text-ink-muted"}>{text}</span> : null;
}
