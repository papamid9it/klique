import type { Metadata } from "next";
import { VerifyEmail } from "@/components/domain/auth/VerifyEmail";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };
export default function Page() {
  return <VerifyEmail />;
}
