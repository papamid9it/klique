import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Communities", description: "Skaters, runners, photographers and more. Find your people near you on klique." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
