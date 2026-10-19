import type { MetadataRoute } from "next";
import { appUrl } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/settings", "/messages", "/saved", "/invite/", "/reset-password", "/verify-email"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
