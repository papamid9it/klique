"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SocialIcon } from "@/components/ui/SocialIcons";
import { SOCIALS, socialHandle, type SocialId } from "@/lib/socials";
import type { UserMe } from "@/lib/types";

/** Settings → Socials: a username for each site. Your profile shows only the icons. */
export function SocialsEditor({ me }: { me: UserMe }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [typed, setTyped] = useState<Record<string, string>>(Object.fromEntries((me.socials ?? []).map((s) => [s.platform, s.handle])));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const bad = (id: string) => !!typed[id]?.trim() && !socialHandle(id, typed[id]);

  async function save() {
    setTried(true);
    if (SOCIALS.some((s) => bad(s.id))) return;
    setBusy(true);
    try {
      const socials = SOCIALS.flatMap((s) => (typed[s.id]?.trim() ? [{ platform: s.id as SocialId, handle: socialHandle(s.id, typed[s.id])! }] : []));
      const res = await ProfileService.updateMe({ socials });
      setUser(res.data);
      setTyped(Object.fromEntries(socials.map((s) => [s.platform, s.handle])));
      toast("Socials saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-lg">
      <p className="mb-4 text-sm text-ink-muted">Add your username or paste a link to your page. Your profile only shows the icons, and people are told they&apos;re leaving Klique before one opens.</p>
      <ul className="space-y-3">
        {SOCIALS.map((s) => (
          <li key={s.id}>
            <div className="flex items-center gap-3">
              <SocialIcon id={s.id} size={38} />
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[13px] font-medium">{s.name}</span>
                <input value={typed[s.id] ?? ""} onChange={(e) => setTyped((t) => ({ ...t, [s.id]: e.target.value }))} placeholder="Username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={200} aria-invalid={tried && bad(s.id)} className="h-11 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none focus:border-ink" />
              </label>
            </div>
            {tried && bad(s.id) && <p role="alert" className="mt-1 ml-[50px] text-xs text-danger">That doesn&apos;t look like a {s.name} username.</p>}
          </li>
        ))}
      </ul>
      <Button className="mt-5" loading={busy} onClick={() => void save()}>Save socials</Button>
    </section>
  );
}
