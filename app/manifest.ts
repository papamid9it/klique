import type { MetadataRoute } from "next";
import { ANDROID_APP_URL, ANDROID_PACKAGE } from "@/lib/constants";

/**
 * The web app manifest, so Chrome, Edge and phones can install Klique from the browser (the download page offers it).
 * No service worker caching comes with it: the installed app always loads the live site.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Klique",
    short_name: "Klique",
    description: "Find your people and real-life events near you.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // on Android phones the real app is the one to get: Chrome doesn't offer "Install Klique" (the website) there
    related_applications: [{ platform: "play", url: ANDROID_APP_URL, id: ANDROID_PACKAGE }],
    prefer_related_applications: true,
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
