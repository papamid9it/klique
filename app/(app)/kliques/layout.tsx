import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Kliques", description: "Small groups heading out together. Join one, or start your own on klique." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
