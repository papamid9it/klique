import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // where uploaded pictures and videos are served from, for picking the right stored copy in the browser
  env: { NEXT_PUBLIC_MEDIA_URL: (process.env.R2_PUBLIC_URL ?? "").trim().replace(/\/$/, "") },
  partialPrefetching: true,
  // Pictures that never change under the same name are cached for a year; the browser never re-asks.
  async headers() {
    return [
      { source: "/mock/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // the notification service worker must never be served stale
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      { source: "/:all*(svg|jpg|jpeg|png|webp|avif|woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
