import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { desktopRelease } from "@/server/services/desktop.service";
import { DownloadView } from "./DownloadView";

export const metadata: Metadata = {
  title: "Download Klique for desktop",
  description: "Klique for Windows, Mac and Linux: your communities, kliques, chats and events in their own window, with notifications.",
};

/** the release manifest, kept for a few minutes */
async function release() {
  "use cache";
  cacheLife("minutes");
  return desktopRelease();
}

/** /download: the desktop app for Windows, Mac and Linux, from the release manifest. */
export default async function DownloadPage() {
  return <DownloadView release={await release()} />;
}
