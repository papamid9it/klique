import { LogoArt, TAGLINE } from "./brand-logo";

/** The 1200×630 card shown when a klique link is shared. Plain JSX for ImageResponse. */
export const SHARE_SIZE = { width: 1200, height: 630 };

export function ShareCard({ eyebrow, title, lines = [], image }: { eyebrow: string; title: string; lines?: string[]; image?: string | null }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0a", color: "#fafafa", fontFamily: "sans-serif" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <LogoArt height={92} colors={{ ink: "#f5f5f5", accent: "#ffffff", accent2: "#8a8a8a" }} />
          <span style={{ fontSize: 18, letterSpacing: 7, color: "#a3a3a3", paddingLeft: 6 }}>{TAGLINE}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: "#a3a3a3" }}>{eyebrow}</span>
          <span style={{ fontSize: title.length > 40 ? 58 : 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{title.length > 90 ? `${title.slice(0, 89)}…` : title}</span>
          {lines.filter(Boolean).map((l) => (
            <span key={l} style={{ fontSize: 30, color: "#d4d4d4" }}>
              {l.length > 60 ? `${l.slice(0, 59)}…` : l}
            </span>
          ))}
        </div>
      </div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" width={460} height={630} style={{ width: 460, height: 630, objectFit: "cover" }} />
      )}
    </div>
  );
}
