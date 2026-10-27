import { MarkArt } from "./brand-logo";

/* The Klique mark (the K with its crown, lib/brand-logo) as plain JSX for ImageResponse: app icons and share images. */
export function Mark({ size, radius = size * 0.22 }: { size: number; radius?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <MarkArt size={Math.round(size * 0.9)} colors={{ ink: "#fafafa", accent: "#ffffff" }} />
    </div>
  );
}
