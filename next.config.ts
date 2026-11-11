import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // where uploaded pictures and videos are served from, for picking the right stored copy in the browser
  env: { NEXT_PUBLIC_MEDIA_URL: (process.env.R2_PUBLIC_URL ?? "").trim().replace(/\/$/, "") },
  partialPrefetching: true,
  // crews became kliques (Nov 2026): old links keep working
  async redirects() {
    return [
      { source: "/crews/:id", destination: "/kliques/:id", permanent: true },
      { source: "/events/:id/crews", destination: "/events/:id/kliques", permanent: true },
      { source: "/og/crew/:id", destination: "/og/klique/:id", permanent: true },
    ];
  },
  // Pictures that never change under the same name are cached for a year; the browser never re-asks.
  async headers() {
    return [
      // basic protection on every page: no framing by other sites (clickjacking), no type sniffing, a careful referrer
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "browsing-topics=()" },
        ],
      },
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
