import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Suspense, type ReactNode } from "react";
import { BootSplash } from "@/components/layout/BootSplash";
import { Providers } from "@/components/providers/Providers";
import { MOOD_BOOT_SCRIPT } from "@/components/providers/ThemeProvider";
import "./globals.css";
import "./motion.css";
import { DEFAULT_MOOD } from "@/lib/moods";

export const metadata: Metadata = {
  metadataBase: new URL((process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")),
  title: { default: "klique. — find your klique", template: "%s · klique." },
  description: "Discover communities, meet people in your scene and find real-life events in your city",
  applicationName: "klique.",
  openGraph: { type: "website", siteName: "klique.", locale: "en_NG" },
  twitter: { card: "summary_large_image" },
};

// the browser bars match the default mood: Paper Mono, or Monochrome when the device is in dark mode
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f6f6" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_MOOD} suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} select-none` }>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOOD_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Suspense fallback={<BootSplash />}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
