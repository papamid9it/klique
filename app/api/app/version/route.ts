import { NextResponse } from "next/server";
import { desktopRelease } from "@/server/services/desktop.service";

/**
 * For the desktop app: the newest version, the oldest still allowed (older apps are asked to update), where to
 * download (Windows, Linux, and Mac for Apple Silicon or Intel), and the release notes. Open to any caller (GET only).
 */
export async function GET() {
  const r = await desktopRelease();
  // null until the manifest has Mac files
  const macPick = (arch: "arm64" | "x64") => r.files.find((f) => f.os === "mac" && f.kind === "dmg" && f.arch === arch)?.url ?? null;
  const pick = (os: string, kinds: string[]) => kinds.map((k) => r.files.find((f) => f.os === os && f.kind === k)).find(Boolean)?.url ?? null;
  return NextResponse.json(
    { minVersion: r.minVersion, latestVersion: r.version, date: r.date, downloads: { win: pick("windows", ["installer", "portable"]), linux: pick("linux", ["appimage", "deb", "targz"]), mac: macPick("arm64"), macIntel: macPick("x64"), page: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://getklique.app"}/download` }, notes: r.notes ?? "" },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } },
  );
}
