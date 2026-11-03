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
const V = "1.0.0";
const f = (os: DesktopOs, kind: DesktopKind, label: string, name: string, size: number, sha256: string): DesktopFile => ({ os, kind, label, url: `${BASE}/${V}/${name}`, size, sha256 });

/** Until the real manifest is online: the files the first release will have. */
export const FALLBACK_RELEASE: DesktopRelease = {
  version: V,
  date: "2026-11-03",
  minVersion: V,
  notes: "First release of the Klique desktop app.",
  files: [
    f("windows", "installer", "Windows installer (.exe)", `Klique-Setup-${V}.exe`, 115297647, "6a06e1dd024f7b13e35c29774e9c4c003ef27c986bdf91ff7250e8c9e50d5c7f"),
    f("windows", "portable", "Portable (.zip)", `Klique-${V}-win-x64.zip`, 153210868, "3c7beaf715cfca0a23b90df6db70733f5778be51b95dcb454d5e29a1a41f44d9"),
    f("linux", "appimage", "AppImage (any distro)", `Klique-${V}-x86_64.AppImage`, 125677746, "7bc6828f7ad79ec5a6b43c5f478d05d21d25d9ad8674a8718e28ac071efdb412"),
    f("linux", "deb", "Ubuntu / Debian / Mint (.deb)", `klique_${V}_amd64.deb`, 90141650, "5c3487a280a9e53deb998d6e73ba90b736fb0edb84ea259c98e12d41301a8b71"),
    f("linux", "pacman", "Arch, Manjaro (.pkg.tar.xz)", `klique-${V}-x86_64.pkg.tar.xz`, 90159368, "334ba019bf88ae3598871ac149b3019d0fb41c51d38f7721a9bc89f0285549d2"),
    f("linux", "rpm", "Fedora, openSUSE (.rpm)", `klique-${V}.x86_64.rpm`, 90054653, "0efa54f0ddd47931d1d706f2090302238fb45af6c841b076af97e92d5300646c"),
    f("linux", "targz", "Archive (.tar.gz)", `Klique-${V}-linux-x64.tar.gz`, 119932891, "d0450670164af773bc318fe0cc5ddc068526193931e813536d876cd1884642b0"),
    // Mac comes later: "dmg" files with arch "arm64" / "x64" (Klique-<v>-arm64.dmg, Klique-<v>-x64.dmg)
  ],
};

/** "84.2 MB" */
export const fileSize = (bytes: number | null) => (bytes ? (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`) : null);
