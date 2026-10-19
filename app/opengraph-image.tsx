import { ImageResponse } from "next/og";
import { SHARE_SIZE, ShareCard } from "@/lib/share-card";

export const alt = "klique. — find your people";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<ShareCard eyebrow="Communities · chat · events" title="Find your people." lines={["Real-life events and communities near you."]} />, size);
}
