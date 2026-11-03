import type { Metadata } from "next";
import { AppReturn } from "@/components/domain/auth/AppReturn";
import { nativeRedirects } from "@/server/env";

export const metadata: Metadata = { title: "Opening Klique", robots: { index: false }, referrer: "no-referrer" };

/**
 * Where the browser lands after "Continue with Google" from the desktop (or phone) app, like Slack's "Opening
 * Slack…" page: it hands the one-time code to the app through its klique:// link, with a button in case the
 * browser didn't. Only addresses on the server's allow-list are ever opened. The code alone is useless: the app
 * redeems it with a secret only it holds.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const to = one("to");
  const allowed = nativeRedirects().includes(to);
  const params = new URLSearchParams();
  for (const k of ["code", "error", "new"]) if (one(k)) params.set(k, one(k).slice(0, 200));
  return <AppReturn target={allowed && (params.has("code") || params.has("error")) ? `${to}?${params}` : null} failed={params.has("error")} />;
}
