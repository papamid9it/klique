import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Suspense, type ReactNode } from "react";
import { Providers } from "@/components/providers/Providers";
import { MOOD_BOOT_SCRIPT } from "@/components/providers/ThemeProvider";
import "./globals.css";
import "./motion.css";

export const metadata: Metadata = {
  title: { default: "klique. — find your people", template: "%s · klique." },
  description: "Discover communities, meet people in your scene and find real-life events in Lagos and Abuja.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a0a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="monochrome" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOOD_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
