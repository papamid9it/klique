/**
 * Klique for desktop: what the download page offers. The real list comes from a JSON manifest the release build
 * uploads (DESKTOP_RELEASES_URL, default https://downloads.getklique.app/desktop/latest.json); this file is its
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

const BASE = "https://downloads.getklique.app/desktop";
const V = "1.0.0";
const f = (os: DesktopOs, kind: DesktopKind, label: string, name: string, size: number): DesktopFile => ({ os, kind, label, url: `${BASE}/${V}/${name}`, size, sha256: null });

/** Until the real manifest is online: the files the first release will have. */
export const FALLBACK_RELEASE: DesktopRelease = {
  version: V,
  date: "2026-11-03",
  minVersion: V,
  notes: "The first Klique for desktop: your communities, kliques, chats and events in their own window, with notifications.",
  files: [
    f("windows", "installer", "Installer (.exe)", `Klique-Setup-${V}.exe`, 115297647),
    f("windows", "portable", "Portable (.zip)", `Klique-${V}-win-x64.zip`, 153210868),
    f("linux", "appimage", "AppImage (any distro)", `Klique-${V}-x86_64.AppImage`, 125677746),
    f("linux", "deb", "Ubuntu, Debian, Mint (.deb)", `klique_${V}_amd64.deb`, 90141650),
    f("linux", "pacman", "Arch, Manjaro (.pkg.tar.xz)", `klique-${V}-x86_64.pkg.tar.xz`, 90159368),
    f("linux", "rpm", "Fedora, openSUSE (.rpm)", `klique-${V}.x86_64.rpm`, 90054653),
    f("linux", "targz", "Archive (.tar.gz)", `Klique-${V}-linux-x64.tar.gz`, 119932891),
    // Mac comes later: "dmg" files with arch "arm64" / "x64" (Klique-<v>-arm64.dmg, Klique-<v>-x64.dmg)
  ],
};

/** "84.2 MB" */
export const fileSize = (bytes: number | null) => (bytes ? (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`) : null);
