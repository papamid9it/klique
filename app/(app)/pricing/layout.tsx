import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Pricing", description: "What you get with klique Lite and Pro." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
