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
const V = "1.2.0";
const f = (os: DesktopOs, kind: DesktopKind, label: string, name: string, size: number, sha256: string): DesktopFile => ({ os, kind, label, url: `${BASE}/${V}/${name}`, size, sha256 });

/** Until the real manifest is online: the files the first release will have. */
export const FALLBACK_RELEASE: DesktopRelease = {
  version: V,
  date: "2026-11-04",
  minVersion: "1.0.0",
  notes: "New loading screen when the app opens. Google sign-in works in the app.",
  files: [
    f("windows", "installer", "Windows installer (.exe)", `Klique-Setup-${V}.exe`, 115299682, "d3c6deb38803d1380cebc063bd361d30ac06ee182793aded54614836b3b5a755"),
    f("windows", "portable", "Portable (.zip)", `Klique-${V}-win-x64.zip`, 153213160, "9fe77c5d395490ad26940d10b64f2ad2df0911ea8811141ce829a5634ef41809"),
    f("linux", "appimage", "AppImage (any distro)", `Klique-${V}-x86_64.AppImage`, 125677725, "fefee56f4da76387d6b1d531ee21a7d90b0dc9c876ce9bc931673b38bcdb0335"),
    f("linux", "deb", "Ubuntu / Debian / Mint (.deb)", `klique_${V}_amd64.deb`, 90158780, "e4e97139b2091992c84537377a38d5251f2bc89c21398b5c15f6e5dd930457d5"),
    f("linux", "pacman", "Arch, Manjaro (.pkg.tar.xz)", `klique-${V}-x86_64.pkg.tar.xz`, 90163760, "311f3c1a53417e753503d3638d81a92116b32494b907c1a6dab86c45e15c970d"),
    f("linux", "rpm", "Fedora, openSUSE (.rpm)", `klique-${V}.x86_64.rpm`, 90064113, "5383fb5d0f48a469bb09dd6acd0de8aca51d09e863029b0c465d71b1c56c944d"),
    f("linux", "targz", "Archive (.tar.gz)", `Klique-${V}-linux-x64.tar.gz`, 119935130, "c89b92b249ae3b4ea020ac8581fd145f6f114bd0d795dc8da83b7ef7ec73d396"),
    // Mac comes later: "dmg" files with arch "arm64" / "x64" (Klique-<v>-arm64.dmg, Klique-<v>-x64.dmg)
  ],
};

/** "84.2 MB" */
export const fileSize = (bytes: number | null) => (bytes ? (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`) : null);
