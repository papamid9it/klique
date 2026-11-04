/**
 * Klique for desktop: what the download page offers. The real list comes from a JSON manifest the release build
 * uploads (DESKTOP_RELEASES_URL, default <DESKTOP_BASE>/latest.json); this file is its
 * shape, and the fallback shown until that's online (or if it can't be reached).
 */
export type DesktopOs = "windows" | "linux" | "mac";
export type DesktopKind = "installer" | "portable" | "appimage" | "deb" | "pacman" | "rpm" | "targz" | "dmg";

export interface DesktopFile {
  os: DesktopOs;
  kind: DesktopKind;
  /** "Installer (.exe)", "AppImage (any distro)"… */
  label: string;
  url: string;
  /** bytes; null when not known yet */
  size: number | null;
  sha256: string | null;
  /** Mac: which chip it's for */
  arch?: "arm64" | "x64";
}

export interface DesktopRelease {
  version: string;
  /** ISO date of the release */
  date: string;
  /** older apps below this are asked to update */
  minVersion: string;
  notes?: string;
  files: DesktopFile[];
}

/** Cloudflare R2 bucket "klique-downloads", public r2.dev address (getklique.app's DNS isn't on Cloudflare, so no custom domain yet) */
export const DESKTOP_BASE = "https://pub-9192d32c2cf64dfb8fc2e2c5e8e046c2.r2.dev/desktop";
const BASE = DESKTOP_BASE;
const V = "1.1.0";
const f = (os: DesktopOs, kind: DesktopKind, label: string, name: string, size: number, sha256: string): DesktopFile => ({ os, kind, label, url: `${BASE}/${V}/${name}`, size, sha256 });

/** Until the real manifest is online: the files the first release will have. */
export const FALLBACK_RELEASE: DesktopRelease = {
  version: V,
  date: "2026-11-04",
  minVersion: "1.0.0",
  notes: "Google sign-in now works in the desktop app. Arch package installs without extra flags.",
  files: [
    f("windows", "installer", "Windows installer (.exe)", `Klique-Setup-${V}.exe`, 115298737, "47f6e8cae303f30e5db8c3fcdf2496cd08c47597c96804109f8621795a5a0cb8"),
    f("windows", "portable", "Portable (.zip)", `Klique-${V}-win-x64.zip`, 153212166, "0d1579ad6c74bf9319b6fe8e44bef13d3a84f5d735c066b27eeb3982b01d4d5b"),
    f("linux", "appimage", "AppImage (any distro)", `Klique-${V}-x86_64.AppImage`, 125677728, "d260409005e38f111089d56ea98d7750de2c0eb8068381cd28c51eb96f0b8287"),
    f("linux", "deb", "Ubuntu / Debian / Mint (.deb)", `klique_${V}_amd64.deb`, 90162534, "f862b789ef207afb9dea52d049bafea7a8f30ede2b88b37567c45d73cfbcc56c"),
    f("linux", "pacman", "Arch, Manjaro (.pkg.tar.xz)", `klique-${V}-x86_64.pkg.tar.xz`, 90158184, "c5f6d89fe28fde3fc0f3db3ec758ea6acd43397ef53b519e66ee64955cb75fa0"),
    f("linux", "rpm", "Fedora, openSUSE (.rpm)", `klique-${V}.x86_64.rpm`, 90067089, "37f4b57f3b32944366e4861657966697565567be763ca72466d6ab6e224efc29"),
    f("linux", "targz", "Archive (.tar.gz)", `Klique-${V}-linux-x64.tar.gz`, 119934158, "fece0b11c24f4e51ee04b5960e5d6d6fe936ff632b19242265342403a91562db"),
    // Mac comes later: "dmg" files with arch "arm64" / "x64" (Klique-<v>-arm64.dmg, Klique-<v>-x64.dmg)
  ],
};

/** "84.2 MB" */
export const fileSize = (bytes: number | null) => (bytes ? (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`) : null);
