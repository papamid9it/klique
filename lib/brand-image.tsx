/* The klique. mark as plain JSX for ImageResponse (app icons and share images). */
export function Mark({ size, radius = size * 0.22 }: { size: number; radius?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="#fafafa" strokeWidth={2.6} strokeLinecap="round">
        <path d="M12 3.5v17M4.6 7.8l14.8 8.4M4.6 16.2 19.4 7.8" />
      </svg>
    </div>
  );
}
