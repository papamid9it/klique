import "server-only";
import { z } from "zod";
import { FALLBACK_RELEASE, type DesktopRelease } from "@/lib/desktop-release";

/**
 * The desktop release manifest (lib/desktop-release): fetched from DESKTOP_RELEASES_URL (default
 * https://downloads.getklique.app/desktop/latest.json), kept for 5 minutes, checked; anything wrong or offline and
 * the built-in fallback is used, so /download and /api/app/version always answer.
 */
const fileSchema = z.object({
  os: z.enum(["windows", "linux", "mac"]),
  kind: z.enum(["installer", "portable", "appimage", "deb", "pacman", "rpm", "targz", "dmg"]),
  label: z.string().max(80),
  url: z.string().url().max(500),
  size: z.number().int().nonnegative().nullable().optional().default(null),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional().default(null),
  arch: z.enum(["arm64", "x64"]).optional(),
});
const manifestSchema = z.object({
  version: z.string().max(30),
  date: z.string().max(40),
  minVersion: z.string().max(30),
  notes: z.string().max(2000).optional(),
  files: z.array(fileSchema).max(40),
});

export const releasesUrl = () => (process.env.DESKTOP_RELEASES_URL?.trim() || "https://downloads.getklique.app/desktop/latest.json");

export async function desktopRelease(): Promise<DesktopRelease & { live: boolean }> {
  try {
    const res = await fetch(releasesUrl(), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = manifestSchema.parse(await res.json());
    return { ...parsed, live: true };
  } catch {
    return { ...FALLBACK_RELEASE, live: false };
  }
}
