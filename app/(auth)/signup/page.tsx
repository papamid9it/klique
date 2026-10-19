import type { Metadata } from "next";
import { AuthForm } from "@/components/domain/AuthForm";

export const metadata: Metadata = { title: "Join klique" };
export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
