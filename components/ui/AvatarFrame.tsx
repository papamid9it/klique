import type { CSSProperties, ReactNode } from "react";
import { getFrame } from "@/lib/cosmetics";

/** Gap (px) kept between the picture and the ring. */
const GAP = 1;

/** Ring thickness for an avatar of `size` px. */
export function frameRing(size: number, ring: number) {
  return Math.min(4, Math.max(2, Math.round((ring * size) / 72)));
}

/**
 * Draws an animated ring around `children` (the picture) inside the SAME footprint, so a frame never
 * shifts the layout. `render(inner)` gets the picture size to draw. Pure CSS: see globals.css.
 */
export function AvatarFrame({ frame, size, render }: { frame: string; size: number; render: (inner: number) => ReactNode }) {
  const spec = getFrame(frame);
  if (!spec) return <>{render(size)}</>;
  const rw = frameRing(size, spec.ring);
  const inner = Math.max(8, size - 2 * (rw + GAP));
  const grad = `conic-gradient(${spec.colors.join(",")})`;
  const base = { "--rw": `${rw}px` } as CSSProperties;
  const dot = Math.max(3, Math.round(rw * 1.4));
  return (
    <span className="kq-frame" style={{ width: size, height: size, ...base }} data-frame={spec.id}>
      {spec.glow && <span className="kq-glow" style={{ "--gc": spec.glow.color, "--pulse": `${spec.glow.pulse}ms` } as CSSProperties} />}
      {spec.glitch ? (
        <>
          <span className="kq-ring ja" style={{ "--ring-bg": spec.colors[0] } as CSSProperties} />
          <span className="kq-ring jb" style={{ "--ring-bg": spec.id === "matrix" ? "#007a33" : "#ff2bd6" } as CSSProperties} />
        </>
      ) : (
        <span
          className={`kq-ring${spec.spin ? " spin" : ""}${spec.flicker ? " flick" : ""}`}
          style={{ "--ring-bg": grad, "--spin": `${spec.spin}ms` } as CSSProperties}
        />
      )}
      {spec.orbit && (
        <span className="kq-orbit" style={{ "--orb": `${spec.orbit.ms}ms`, "--dot": `${dot}px`, "--dc": spec.orbit.color } as CSSProperties}>
          {Array.from({ length: spec.orbit.count }, (_, i) => (
            <span key={i} className="absolute inset-0" style={{ transform: `rotate(${(360 / spec.orbit!.count) * i}deg)` }}>
              <span className="kq-dot" />
            </span>
          ))}
        </span>
      )}
      <span className="kq-pic inline-flex">{render(inner)}</span>
    </span>
  );
}
