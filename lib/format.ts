/**
 * Formatting helpers. Everything is rendered in Africa/Lagos (WAT, UTC+1, no
 * DST — also correct for Abuja) and composed manually from stable Intl parts,
 * so the server and the browser always produce identical text.
 */

const TZ = "Africa/Lagos";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

interface LagosParts {
  weekday: string;
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  period: "AM" | "PM";
}

function lagosParts(input: string | Date): LagosParts {
  const d = typeof input === "string" ? new Date(input) : input;
  const map: Record<string, string> = {};
  for (const p of parts.formatToParts(d)) map[p.type] = p.value;
  return {
    weekday: map.weekday,
    day: map.day,
    month: map.month,
    year: map.year,
    hour: map.hour,
    minute: map.minute,
    period: (map.dayPeriod ?? "").toUpperCase() === "PM" ? "PM" : "AM",
  };
}

export function formatNaira(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return "Free";
  return "₦" + Math.round(amount).toLocaleString("en-US");
}

/** "₦5,000", "GH₵80", "$12" — in the event's own currency; "Free" for 0. */
export function formatPrice(amount: number | null | undefined, currency = "NGN"): string {
  if (!amount || amount <= 0) return "Free";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}

/** Currencies offered when hosting. The country's own comes first. */
export const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "XOF", "EGP", "UGX", "TZS", "RWF", "MAD", "GBP", "EUR", "USD", "CAD", "AED"];

export function isFree(amount: number | null | undefined) {
  return !amount || amount <= 0;
}

/** "4:00 PM" */
export function formatTime(input: string | Date): string {
  const p = lagosParts(input);
  return `${p.hour}:${p.minute} ${p.period}`;
}

/** { month: "OCT", day: "18", weekday: "Sun" } for date chips */
export function dateChip(input: string | Date) {
  const p = lagosParts(input);
  return {
    month: p.month.slice(0, 3).toUpperCase(),
    day: p.day,
    weekday: p.weekday.slice(0, 3),
  };
}

/** "Sunday 18 October" */
export function formatDateLong(input: string | Date): string {
  const p = lagosParts(input);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Sun 18 Oct · 4:00 PM" */
export function formatDateShort(input: string | Date): string {
  const p = lagosParts(input);
  return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)} · ${p.hour}:${p.minute} ${p.period}`;
}

/** "SUNDAY, OCTOBER 11" — eyebrow text */
export function formatEyebrowDate(input: string | Date): string {
  const p = lagosParts(input);
  return `${p.weekday}, ${p.month} ${p.day}`.toUpperCase();
}

/** 1200 -> "1.2K" */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1_000_000) return Math.round(n / 1000) + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

export function pluralize(n: number, one: string, many = one + "s") {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Short relative stamp for inbox rows: "now", "5m", "3h", "Tue", "12 Oct". */
export function relativeStamp(input: string | Date, now: Date = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return lagosParts(d).weekday.slice(0, 3);
  const p = lagosParts(d);
  return `${p.day} ${p.month.slice(0, 3)}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/* ---------------------------- sharing ------------------------------ */

export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}
