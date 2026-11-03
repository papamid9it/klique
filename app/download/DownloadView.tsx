"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/layout/Logo";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { fileSize, type DesktopFile, type DesktopOs, type DesktopRelease } from "@/lib/desktop-release";

type Seen = DesktopOs | "phone" | null;
type Chip = "arm64" | "x64";

/** Which system is this? (Windows, Linux, Mac, or a phone) */
function detect(): Seen {
  const ua = navigator.userAgent;
  // iPads report themselves as a Mac: a touch screen gives them away
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "phone";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return null;
}

/**
 * Apple Silicon or Intel? Chrome and Edge say so outright; otherwise the graphics chip name gives it away ("Apple M…"
 * means Apple Silicon). When nothing tells us, Apple Silicon: every Mac sold since 2021.
 */
async function macChip(): Promise<Chip> {
  try {
    const uad = (navigator as unknown as { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> } }).userAgentData;
    const arch = (await uad?.getHighEntropyValues(["architecture"]))?.architecture;
    if (arch) return arch === "x86" ? "x64" : "arm64";
  } catch {
    /* not offered */
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const gpu = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    if (/Intel|AMD|Radeon/i.test(gpu)) return "x64";
  } catch {
    /* no WebGL */
  }
  return "arm64";
}
const CHIP_NAME: Record<Chip, string> = { arm64: "Apple Silicon", x64: "Intel" };

const OS_NAME: Record<DesktopOs, string> = { windows: "Windows", linux: "Linux", mac: "Mac" };
const date = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

/**
 * The download page. Big type and a bit of motion (it's Klique), one big button for your system, then every file
 * with its size and checksum, how to install it, and a short FAQ.
 */
export function DownloadView({ release }: { release: DesktopRelease & { live: boolean } }) {
  const [os, setOs] = useState<Seen>(null);
  const [chip, setChip] = useState<Chip>("arm64");
  useEffect(() => {
    const seen = detect();
    setOs(seen);
    if (seen === "mac") void macChip().then(setChip);
  }, []);
  const files = (o: DesktopOs) => release.files.filter((f) => f.os === o);
  const macFor = (c: Chip) => files("mac").find((f) => f.kind === "dmg" && f.arch === c) ?? null;
  const macReady = files("mac").length > 0;
  const otherChip: Chip = chip === "arm64" ? "x64" : "arm64";
  const primary: DesktopFile | null =
    os === "windows" ? (files("windows").find((f) => f.kind === "installer") ?? files("windows")[0] ?? null) : os === "linux" ? (files("linux").find((f) => f.kind === "appimage") ?? files("linux")[0] ?? null) : os === "mac" ? (macFor(chip) ?? files("mac")[0] ?? null) : null;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-canvas text-ink">
      {/* top */}
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Klique home">
          <Logo height={34} />
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm font-medium">
          <a href="#all" className="hidden text-ink-muted hover:text-ink sm:inline">
            All downloads
          </a>
          <a href="#faq" className="hidden text-ink-muted hover:text-ink sm:inline">
            FAQ
          </a>
          <Link href="/" className="rounded-full border border-line px-4 py-2 hover:border-ink">
            Open in browser
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-14">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-24 size-[28rem] rounded-full bg-accent/25 blur-3xl motion-safe:animate-[kqdrift_14s_ease-in-out_infinite_alternate]" />
        <div className="relative">
          <p className="eyebrow">Klique for desktop · v{release.version}</p>
          <h1 className="mt-4 text-[clamp(3rem,9vw,7.5rem)] leading-[0.92] font-black tracking-[-0.055em]">
            Your people.
            <br />
            <span className="relative inline-block">
              Your desktop.
              <span aria-hidden="true" className="absolute -bottom-1 left-0 h-[0.12em] w-full origin-left bg-accent motion-safe:animate-[kqline_1.2s_cubic-bezier(.2,.8,.2,1)_both]" />
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-muted">Communities, kliques, chats and events in a window of their own. Notifications that actually reach you. Starts with your computer, if you like.</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {primary ? (
              <a href={primary.url} className="group inline-flex h-14 items-center gap-3 rounded-full bg-ink px-7 text-[17px] font-bold text-canvas transition hover:scale-[1.02] active:scale-[0.98]">
                <Icon name="download" size={20} className="transition group-hover:translate-y-0.5" />
                Download for {OS_NAME[os as DesktopOs]}
              </a>
            ) : os === "mac" && !macReady ? (
              <span className="inline-flex h-14 items-center gap-3 rounded-full border-2 border-dashed border-line px-7 text-[17px] font-bold text-ink-muted">Mac app coming soon</span>
            ) : os === "phone" ? (
              <Link href="/" className="inline-flex h-14 items-center gap-3 rounded-full bg-ink px-7 text-[17px] font-bold text-canvas">
                Open Klique in your browser
              </Link>
            ) : (
              <a href="#all" className="inline-flex h-14 items-center gap-3 rounded-full bg-ink px-7 text-[17px] font-bold text-canvas">
                <Icon name="download" size={20} /> Choose your download
              </a>
            )}
            {os === "mac" && macFor(otherChip) && macFor(otherChip) !== primary && (
              <a href={macFor(otherChip)!.url} className="text-sm font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                {CHIP_NAME[otherChip]} Mac?
              </a>
            )}
            <a href="#all" className="text-sm font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline">
              Other systems
            </a>
          </div>
          <p className="mt-4 font-mono text-[12px] text-ink-muted">
            v{release.version} · {date(release.date)}
            {primary && fileSize(primary.size) ? ` · ${fileSize(primary.size)}` : ""}
            {os === "linux" ? " · AppImage runs on any distro" : ""}
            {os === "mac" && primary ? ` · for ${CHIP_NAME[chip]} Macs` : ""}
            {os === "phone" ? " · on a phone, add getklique.app to your home screen" : ""}
          </p>
          {!release.live && <p className="mt-3 inline-block rounded-full border border-line px-3 py-1 text-[12px] text-ink-muted">Downloads go live very soon. If a link doesn&apos;t work yet, check back shortly.</p>}
        </div>

        {/* a little app window, floating */}
        <div aria-hidden="true" className="relative mx-auto w-full max-w-md motion-safe:animate-[kqfloat_7s_ease-in-out_infinite]">
          <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_40px_120px_-40px_rgba(0,0,0,.45)]">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[11px] text-ink-muted">Klique</span>
            </div>
            <div className="grid grid-cols-[3.25rem_1fr]">
              <div className="space-y-2.5 border-r border-line p-2.5">
                {["bg-accent", "bg-raised", "bg-raised", "bg-raised"].map((c, i) => (
                  <div key={i} className={cx("size-9 rounded-[12px]", c)} />
                ))}
              </div>
              <div className="space-y-3 p-4">
                {[0.9, 0.65, 0.8, 0.5, 0.72].map((w, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="size-8 shrink-0 rounded-full bg-raised" />
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="h-2 w-20 rounded-full bg-ink/70" />
                      <div className="h-2 rounded-full bg-ink-muted/30" style={{ width: `${w * 100}%` }} />
                    </div>
                  </div>
                ))}
                <div className="mt-2 h-9 rounded-full border border-line" />
              </div>
            </div>
          </div>
          <div className="absolute -right-3 -bottom-4 rotate-[-4deg] rounded-2xl bg-ink px-4 py-2.5 text-[13px] font-bold text-canvas shadow-xl">🔔 Ada started a klique</div>
        </div>
      </section>

      {/* a moving band */}
      <div aria-hidden="true" className="border-y border-line bg-ink py-3 text-canvas">
        <div className="flex w-max gap-10 font-mono text-sm font-bold tracking-[0.2em] whitespace-nowrap uppercase motion-safe:animate-[kqmarquee_28s_linear_infinite]">
          {Array.from({ length: 2 }).flatMap((_, k) => ["Windows", "Linux", "AppImage", ".deb", ".rpm", ".pkg.tar.xz", "Mac soon", "Your people", "Your desktop"].map((w) => <span key={`${k}-${w}`}>{w} ✦</span>))}
        </div>
      </div>

      {/* every download */}
      <section id="all" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8">
        <h2 className="text-[clamp(2rem,5vw,3.25rem)] leading-none font-black tracking-[-0.04em]">Every download.</h2>
        <p className="mt-3 max-w-2xl text-ink-muted">Version {release.version}, released {date(release.date)}. Check a file with its SHA-256 if you like: it&apos;s the same file we built.</p>
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-3">
          <OsCard os="windows" here={os === "windows"} files={files("windows")} steps={["Run Klique-Setup.exe and follow the steps.", "Windows SmartScreen may say it doesn't recognise the app at first: choose More info, then Run anyway.", "Portable .zip: unzip anywhere and open Klique.exe. Nothing gets installed."]} />
          <OsCard
            os="linux"
            here={os === "linux"}
            files={files("linux")}
            steps={["AppImage, any distro: chmod +x Klique-*.AppImage, then run it.", "Ubuntu, Debian, Mint: sudo apt install ./klique_*_amd64.deb", "Arch, Manjaro: sudo pacman -U klique-*.pkg.tar.xz", "Fedora: sudo dnf install ./klique-*.rpm"]}
          />
          {macReady ? (
            <OsCard
              os="mac"
              here={os === "mac"}
              files={files("mac")}
              steps={[
                "Not sure which chip? Apple menu → About This Mac: \"Chip: Apple M…\" is Apple Silicon, \"Processor: Intel\" is Intel.",
                "Open the .dmg and drag Klique into Applications.",
                "The first time, macOS may ask whether to open an app from the internet: choose Open.",
              ]}
            />
          ) : (
            <div className={cx("flex flex-col rounded-[22px] border border-dashed border-line p-6", os === "mac" && "ring-2 ring-accent-text")}>
              <p className="eyebrow">Mac</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">Coming soon</h3>
              <p className="mt-2 flex-1 text-sm text-ink-muted">For Apple Silicon and Intel Macs. Until then, Klique works great in Safari or Chrome.</p>
              <Link href="/" className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-semibold hover:border-ink">
                Use it in the browser
              </Link>
            </div>
          )}
        </div>
        <p className="mt-8 rounded-[18px] bg-raised px-5 py-4 text-sm">
          <strong>On a phone?</strong> No download needed: open <Link href="/" className="font-semibold underline">getklique.app</Link> and add it to your home screen (Share → Add to Home Screen on iPhone, or the ⋮ menu → Install app on Android).
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-6 px-5 pb-24 sm:px-8">
        <h2 className="text-[clamp(2rem,5vw,3.25rem)] leading-none font-black tracking-[-0.04em]">Questions.</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {[
            ["Is it free?", "Yes. The desktop app is the same Klique: your plan (Free, Lite or Pro) comes with you."],
            ["How is it different from the website?", "Its own window and icon, notifications even when the browser is closed, and it can start with your computer. Everything you do syncs with the web and your phone."],
            ["Does it update by itself?", "It checks for new versions and lets you know. Very old versions are asked to update before they sign in."],
            ...(macReady ? [["Which Mac file should I pick?", "Macs from late 2020 on (M1, M2, M3, M4…) take Apple Silicon; older ones take Intel. The big button picks for you."]] : []),
            ["Which Linux file should I pick?", "Not sure? Take the AppImage: it runs on almost any distro. Use .deb on Ubuntu, Debian or Mint, .pkg.tar.xz on Arch or Manjaro, and .rpm on Fedora."],
            ["Windows warned me about the app. Is it safe?", "New apps aren't known to Windows SmartScreen yet. Download only from this page, check the SHA-256 if you want to be sure, then choose More info → Run anyway."],
          ].map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                {q}
                <Icon name="plus" size={18} className="shrink-0 transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-ink-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-10 text-sm text-ink-muted">
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>{" "}
          · Klique v{release.version}
        </p>
      </section>
    </div>
  );
}

function OsCard({ os, here, files, steps }: { os: DesktopOs; here: boolean; files: DesktopFile[]; steps: string[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className={cx("flex flex-col rounded-[22px] border bg-surface p-6", here ? "border-ink ring-2 ring-accent-text" : "border-line")}>
      <div className="flex items-center justify-between">
        <p className="eyebrow">{OS_NAME[os]}</p>
        {here && <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-ink">Your system</span>}
      </div>
      <ul className="mt-4 space-y-2">
        {files.map((f) => (
          <li key={f.url} className="rounded-[14px] border border-line p-3">
            <a href={f.url} className="flex items-center gap-3 font-semibold hover:underline">
              <Icon name="download" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              {fileSize(f.size) && <span className="shrink-0 font-mono text-[11px] font-normal text-ink-muted">{fileSize(f.size)}</span>}
            </a>
            {f.sha256 && (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(f.sha256!).then(() => (setCopied(f.url), setTimeout(() => setCopied(null), 1500)))}
                title="Copy SHA-256"
                className="mt-1.5 block w-full truncate text-left font-mono text-[10.5px] text-ink-muted hover:text-ink"
              >
                {copied === f.url ? "Copied ✓" : `SHA-256 ${f.sha256}`}
              </button>
            )}
          </li>
        ))}
      </ul>
      <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
