import type { Metadata } from "next";
import { ForgotForm } from "@/components/domain/auth/ForgotForm";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };
export default function Page() {
  return <ForgotForm />;
}
