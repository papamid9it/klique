import { ImageResponse } from "next/og";
import { Mark } from "@/lib/brand-image";

/** PNG icons (/app-icon/192, /app-icon/512, /app-icon/maskable), used by browser notifications. */
const SIZES: Record<string, { px: number; maskable?: boolean }> = { "192": { px: 192 }, "512": { px: 512 }, maskable: { px: 512, maskable: true } };

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = SIZES[size];
  if (!s) return new Response("Not found", { status: 404 });
  // maskable icons get cropped to a circle or squircle, so fill the square and keep the mark in the safe zone
  return new ImageResponse(
    s.maskable ? (
      <div style={{ width: s.px, height: s.px, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Mark size={s.px * 0.7} radius={0} />
      </div>
    ) : (
      <Mark size={s.px} />
    ),
    { width: s.px, height: s.px, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
