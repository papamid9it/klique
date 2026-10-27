"use client";

import { ProfileEffect } from "@/components/ui/ProfileEffect";
import { themeStyle } from "@/components/ui/profileTheme";
import { setAutoplay } from "@/lib/autoplay";
import { PointsService } from "@/app/services/PointsService";
import { setDataSaver, type DataSaverPref } from "@/lib/data-saver";
import { setMotion, type MotionPref } from "@/lib/motion";
import { useMotion } from "@/lib/hooks/useCalm";
import { useAutoplay } from "@/lib/hooks/useAutoplay";
import { useDataSaver } from "@/lib/hooks/useDataSaver";
import { useCategories } from "@/lib/hooks/useCategories";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { ProfileService, type ProfileUpdate } from "@/app/services/ProfileService";
import { SafetyService } from "@/app/services/SafetyService";
import { PersonRow } from "@/components/domain/PersonRow";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { useMood } from "@/components/providers/ThemeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ImageField } from "@/components/ui/ImageField";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { PasswordBlock } from "@/components/domain/account/PasswordBlock";
import { DeleteAccount } from "@/components/domain/account/DeleteAccount";
import { DeviceSettings } from "@/components/domain/account/DeviceSettings";
import { NotificationSettings } from "@/components/domain/account/NotificationSettings";
import { ResendButton } from "@/components/domain/account/EmailStatus";
import { StylePicker, themeOf, type StyleDraft } from "@/components/domain/account/StylePicker";
import { HypeTab, UnlockDialog, styleAccess, useHypeWallet } from "@/components/domain/account/Points";
import type { StyleKey } from "@/lib/wallet";
import { UserName } from "@/components/ui/UserName";
import { ProfileBanner, monthYear } from "@/components/domain/profile/ProfileParts";
import { Avatar } from "@/components/ui/Avatar";
import { placeLabel, type Place } from "@/lib/places";
import { DM_POLICIES, LIMITS, PROFILE_VISIBILITY, type DmPolicy, type InterestId, type ProfileVisibility } from "@/lib/constants";
import { useApi } from "@/lib/hooks/useApi";
import { MOODS, type MoodId } from "@/lib/moods";
import type { UserMe } from "@/lib/types";

type Tab = "account" | "profile" | "style" | "hype" | "privacy" | "blocked" | "notifications" | "appearance";
const GROUPS: { title: string; items: { id: Tab; label: string; icon: "user" | "edit" | "asterisk" | "coin" | "shield" | "ban" | "sliders" | "bell" }[] }[] = [
  {
    title: "User settings",
    items: [
      { id: "account", label: "My Account", icon: "user" },
      { id: "profile", label: "Profile", icon: "edit" },
      { id: "style", label: "Profile style", icon: "asterisk" },
      { id: "hype", label: "Hype & points", icon: "coin" },
      { id: "privacy", label: "Privacy & Safety", icon: "shield" },
      { id: "blocked", label: "Blocked people", icon: "ban" },
    ],
  },
  { title: "App settings", items: [{ id: "notifications", label: "Notifications", icon: "bell" }, { id: "appearance", label: "Appearance", icon: "sliders" }] },
];
const TITLES: Record<Tab, string> = { account: "My Account", profile: "Profile", style: "Profile style", hype: "Hype & points", privacy: "Privacy & Safety", blocked: "Blocked people", notifications: "Notifications", appearance: "Appearance" };
/** old anchors (#messages, #safety, #mood…) still land somewhere sensible */
const HASH: Record<string, Tab> = { account: "account", profile: "profile", style: "style", design: "style", hype: "hype", points: "hype", wallet: "hype", rank: "hype", privacy: "privacy", messages: "privacy", safety: "privacy", blocked: "blocked", blocks: "blocked", appearance: "appearance", mood: "appearance", notifications: "notifications" };

/** A titled block inside a tab: small caps heading, optional intro, then the content. */
function Block({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h3 className="eyebrow">{title}</h3>
      {intro && <p className="mt-1.5 text-sm text-ink-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RadioCards<T extends string>({ name, value, options, onChange, disabled }: { name: string; value: T; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className={cx("flex cursor-pointer items-start gap-3 rounded-control border bg-raised px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text", value === o.id ? "border-accent-text" : "border-line", disabled && "opacity-60")}>
          <input type="radio" name={name} value={o.id} checked={value === o.id} disabled={disabled} onChange={() => onChange(o.id)} className="mt-1 accent-[var(--accent-text)]" />
          <span>
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-ink-muted">{o.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

type ProfileDraft = { displayName: string; bio: string; avatarUrl: string; place: Place; neighborhood: string };

function ProfileForm({ me, onDraft }: { me: UserMe; onDraft?: (d: ProfileDraft) => void }) {
  const categories = useCategories();
  const card = useProfileCard();
  const { setUser } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [pronouns, setPronouns] = useState(me.pronouns ?? "");
  const [place, setPlace] = useState<Place>({ country: me.country, region: me.region, city: me.city });
  const [neighborhood, setNeighborhood] = useState(me.neighborhood);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl ?? "");
  const [interests, setInterests] = useState<InterestId[]>(me.interests);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    onDraft?.({ displayName, bio, avatarUrl, place, neighborhood });
  }, [onDraft, displayName, bio, avatarUrl, place, neighborhood]);

  function toggle(id: InterestId) {
    setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= LIMITS.maxInterests ? cur : [...cur, id]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await ProfileService.updateMe({
        displayName: displayName.trim(),
        bio: bio.trim(),
        pronouns: pronouns.trim(),
        ...place,
        neighborhood,
        avatarUrl: avatarUrl.trim() || null,
        interests,
      });
      setUser(res.data);
      toast("Profile saved", "success");
    } catch (err) {
      setError(errorMessage(err));
      const fe = (err as { errors?: Record<string, string> }).errors;
      if (fe) setFieldErrors(fe);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={LIMITS.displayName} required error={fieldErrors.displayName} />
      <TextField label="Handle" value={`@${me.handle}`} readOnly hint="Your handle can't be changed." />
      <TextArea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={LIMITS.bio} counter={LIMITS.bio} error={fieldErrors.bio} hint="A line or two about what you're into." />
      <TextField label="Pronouns (optional)" value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={LIMITS.pronouns} error={fieldErrors.pronouns} placeholder="e.g. she/her" hint="Shown after your name on your profile." />
      <PlaceFields value={place} onChange={(p) => { setPlace(p); }} neighborhood={neighborhood} onNeighborhood={setNeighborhood} errors={fieldErrors} />
      <ImageField kind="avatar" shape="round" label="Profile picture" value={avatarUrl} onChange={setAvatarUrl} error={fieldErrors.avatarUrl} fallback={<Avatar name={displayName || me.displayName} size={80} />} reposition={{ aspect: 1, round: true }} hint="After uploading, drag it to choose what shows in the circle. Leave empty to use your initials." />

      <fieldset>
        <legend className="text-[13px] font-medium">
          Interests <span className="text-ink-muted">({interests.length}/{LIMITS.maxInterests})</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((i) => {
            const on = interests.includes(i.id);
            const locked = !on && interests.length >= LIMITS.maxInterests;
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={on}
                disabled={locked}
                onClick={() => toggle(i.id)}
                className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition disabled:opacity-40", on ? "border-accent bg-accent text-accent-ink" : "border-line bg-raised text-ink hover:border-ink-muted")}
              >
                <span aria-hidden="true">{i.glyph}</span>
                {i.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={busy}>
          Save profile
        </Button>
        <button type="button" onClick={() => card.openFull(me.handle)} className="text-sm font-medium text-accent-text underline underline-offset-2">
          View my profile card
        </button>
      </div>
    </form>
  );
}

function MoodPicker() {
  const { mood, setMood } = useMood();
  const toast = useToast();
  return (
    <div role="radiogroup" aria-label="Mood" className="grid gap-3 sm:grid-cols-2">
      {MOODS.map((m) => {
        const on = mood === m.id;
        const swatches = [m.tokens.canvas, m.tokens.surface, m.tokens.accent, m.tokens.accent2];
        return (
          <label key={m.id} className={cx("relative flex cursor-pointer flex-col gap-3 rounded-card border bg-raised p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text", on ? "border-accent-text ring-1 ring-accent-text" : "border-line hover:border-ink-muted")}>
            <input
              type="radio"
              name="mood"
              value={m.id}
              checked={on}
              onChange={() => {
                setMood(m.id as MoodId);
                toast(`Mood: ${m.name}`, "success");
              }}
              className="sr-only"
            />
            <span className="flex items-center gap-1.5" aria-hidden="true">
              {swatches.map((c, i) => (
                <span key={i} className="size-7 rounded-full border border-line" style={{ backgroundColor: c }} />
              ))}
              {on && <Icon name="check" size={16} className="ml-auto text-accent-text" />}
            </span>
            <span>
              <span className="block text-sm font-semibold">{m.name}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{m.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function PrefsSections({ me }: { me: UserMe }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(p: ProfileUpdate, ok: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await ProfileService.updateMe(p);
      setUser(res.data);
      toast(ok, "success");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Block title="Who can see you" intro="Choose who can see your profile.">
        <div className="space-y-5">
          <RadioCards<ProfileVisibility> name="Profile visibility" value={me.privacy.profileVisibility} options={PROFILE_VISIBILITY} disabled={busy} onChange={(v) => void patch({ profileVisibility: v }, "Privacy updated")} />
          <Switch label="Show my RSVPs" hint="Let people who can see your profile see events you're going to." checked={me.privacy.attendancePublic} disabled={busy} onChange={(v) => void patch({ attendancePublic: v }, v ? "RSVPs are visible" : "RSVPs are private")} />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Block>
      <Block title="Direct messages" intro="Who can start a conversation with you. People you've already chatted with can still reply.">
        <RadioCards<DmPolicy> name="Who can message me" value={me.dmPolicy} options={DM_POLICIES} disabled={busy} onChange={(v) => void patch({ dmPolicy: v }, "Message settings updated")} />
      </Block>
    </>
  );
}

function BlockedList() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => SafetyService.blocked(), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function unblock(handle: string) {
    setBusy(handle);
    try {
      await SafetyService.unblock(handle);
      setData((d) => (d ? d.filter((b) => b.user.handle !== handle) : d));
      toast(`Unblocked @${handle}`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Skeleton className="h-16 w-full rounded-card" />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} title="Couldn't load blocked people" />;
  if (!data?.length) return <p className="text-sm text-ink-muted">You haven&apos;t blocked anyone.</p>;
  return (
    <ul className="space-y-2">
      {data.map((b) => (
        <li key={b.user.id}>
          <PersonRow
            user={b.user}
            action={
              <Button size="sm" onClick={() => void unblock(b.user.handle)} loading={busy === b.user.handle}>
                Unblock
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">{label}</p>
        <p className="mt-1 truncate text-[15px]">{value}</p>
      </div>
      {action}
    </div>
  );
}

function AccountTab({ me, go, onSignOut, onEverywhere, busy }: { me: UserMe; go: (t: Tab) => void; onSignOut: () => void; onEverywhere: () => void; busy: "out" | "all" | null }) {
  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <ProfileBanner handle={me.handle} bannerUrl={me.bannerUrl} bannerColor={me.bannerColor} className="h-24" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <span className="rounded-full bg-surface p-1.5">
              <Avatar name={me.displayName} src={me.avatarUrl} frame={me.avatarFrame} size={80} />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <p className="truncate text-xl font-semibold tracking-[-0.02em]"><UserName name={me.displayName} effect={me.nameEffect} /></p>
              <p className="font-mono text-xs text-ink-muted">@{me.handle}</p>
            </div>
            <Button variant="primary" onClick={() => go("profile")} className="mb-1 shrink-0">
              Edit profile
            </Button>
          </div>
          <div className="mt-5 space-y-5 rounded-control bg-canvas p-4">
            <Row label="Display name" value={me.displayName} action={<Button size="sm" onClick={() => go("profile")}>Edit</Button>} />
            <Row label="Username" value={`@${me.handle}`} />
            <Row
              label="Email"
              value={me.email}
              action={
                me.emailVerified ? (
                  <span className="chip chip-accent">Verified</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="chip chip-ink">Not verified</span>
                    <ResendButton />
                  </span>
                )
              }
            />
            <Row label="Location" value={[me.neighborhood, placeLabel(me)].filter(Boolean).join(", ")} action={<Button size="sm" onClick={() => go("profile")}>Edit</Button>} />
            <Row label="Member since" value={monthYear(me.joinedAt)} />
          </div>
        </div>
      </div>

      <Block title="Password" intro={me.hasPassword ? "Changing it signs you out on every other device." : "You signed up with Google. Add a password if you also want to sign in with your email."}>
        <PasswordBlock me={me} />
      </Block>

      <Block title="Sessions" intro="Sign out here, or end every session if you think someone else has access.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSignOut} loading={busy === "out"}>
            <Icon name="logout" size={15} /> Sign out
          </Button>
          <Button variant="danger" onClick={onEverywhere} loading={busy === "all"}>
            Sign out everywhere
          </Button>
        </div>
      </Block>

      <Block title="Delete account" intro="Permanently remove your account and personal data from klique.">
        <DeleteAccount me={me} />
      </Block>

      <p className="text-xs text-ink-muted">
        Read our <Link href="/terms" className="underline hover:text-ink">Terms</Link> and <Link href="/privacy" className="underline hover:text-ink">Privacy Policy</Link>.
      </p>
    </div>
  );
}

type PreviewDraft = ProfileDraft & StyleDraft;

const styleOf = (me: UserMe): StyleDraft => ({ bannerUrl: me.bannerUrl ?? "", bannerColor: me.bannerColor ?? "", avatarFrame: me.avatarFrame ?? "", nameEffect: me.nameEffect ?? "", profileTheme: me.profileTheme ? `${me.profileTheme.primary},${me.profileTheme.accent}` : "", profileEffect: me.profileEffect ?? "" });
const aboutOf = (me: UserMe): ProfileDraft => ({ displayName: me.displayName, bio: me.bio, avatarUrl: me.avatarUrl ?? "", place: { country: me.country, region: me.region, city: me.city } as Place, neighborhood: me.neighborhood });

/** The little profile card beside the Profile and Profile style forms, updating as you edit. */
function ProfilePreview({ me, draft }: { me: UserMe; draft: PreviewDraft }) {
  return (
    <aside aria-label="Preview" className="lg:sticky lg:top-14 lg:self-start">
      <p className="eyebrow mb-2">Preview</p>
      <div className="relative overflow-hidden rounded-card border border-line bg-surface shadow-lg" style={themeStyle(themeOf(draft.profileTheme))}>
        <ProfileEffect id={draft.profileEffect} />
        <ProfileBanner handle={me.handle} bannerUrl={draft.bannerUrl} bannerColor={draft.bannerColor} className="relative h-16" />
        <div className="relative px-4 pb-4">
          <span className="-mt-9 inline-block rounded-full bg-surface p-1">
            <Avatar name={draft.displayName || me.displayName} src={draft.avatarUrl || null} frame={draft.avatarFrame} size={72} />
          </span>
          <p className="mt-2 truncate text-lg font-semibold tracking-[-0.02em]"><UserName name={draft.displayName || me.displayName} effect={draft.nameEffect} /></p>
          <p className="font-mono text-xs text-ink-muted">@{me.handle}</p>
          <div className="mt-3 space-y-2.5 rounded-control border border-line bg-raised/50 p-3 text-[13px]">
            {draft.bio && <p className="whitespace-pre-wrap">{draft.bio}</p>}
            <p className="inline-flex items-center gap-1 text-ink-muted"><Icon name="pin" size={12} /> {[draft.neighborhood, placeLabel(draft.place)].filter(Boolean).join(", ")}</p>
            <div>
              <p className="eyebrow">Klique member since</p>
              <p className="mt-0.5">{monthYear(me.joinedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ProfileTab({ me }: { me: UserMe }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => aboutOf(me));
  const onDraft = useCallback((d: ProfileDraft) => setDraft(d), []);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <ProfileForm me={me} onDraft={onDraft} />
      <ProfilePreview me={me} draft={{ ...draft, ...styleOf(me) }} />
    </div>
  );
}

/** Banner, picture frame and name style, saved on their own. */
function StyleTab({ me, go }: { me: UserMe; go: (t: Tab) => void }) {
  const { setUser } = useAuth();
  const { data: wallet, setData: setWallet } = useHypeWallet();
  const [unlocking, setUnlocking] = useState<StyleKey | null>(null);
  const toast = useToast();
  const [style, setStyle] = useState<StyleDraft>(() => styleOf(me));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = styleOf(me);
  const dirty = (Object.keys(style) as (keyof StyleDraft)[]).some((k) => style[k] !== saved[k]);

  /** Saving in one of the pickers: just that design, straight away (the server checks it's theirs). */
  async function saveDesign(patch: Partial<StyleDraft>) {
    const res = await ProfileService.updateMe({
      ...(patch.avatarFrame !== undefined ? { avatarFrame: patch.avatarFrame || null } : {}),
      ...(patch.nameEffect !== undefined ? { nameEffect: patch.nameEffect || null } : {}),
      ...(patch.profileTheme !== undefined ? { profileTheme: themeOf(patch.profileTheme) } : {}),
      ...(patch.profileEffect !== undefined ? { profileEffect: patch.profileEffect || null } : {}),
    });
    setUser(res.data);
    toast("Saved", "success");
  }

  /** Try-on → "Unlock all": each locked design in turn (the server checks the Hype); stops at the first that fails. */
  async function unlockAll(keys: StyleKey[]) {
    for (const k of keys) setWallet((await PointsService.unlock(k)).data);
    toast(keys.length === 1 ? "Unlocked" : `${keys.length} designs unlocked`, "success");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await ProfileService.updateMe({
        bannerUrl: style.bannerUrl.trim() || null,
        bannerColor: style.bannerColor || null,
        avatarFrame: style.avatarFrame || null,
        nameEffect: style.nameEffect || null,
        profileTheme: themeOf(style.profileTheme),
        profileEffect: style.profileEffect || null,
      });
      setUser(res.data);
      toast("Banner saved", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <form onSubmit={save} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-ink-muted">How you show up around klique. Your banner is free. {wallet?.allFree ? "As a site admin, every design is free for you." : <>Name effects, frames, themes, effects and animated pictures cost Hype{wallet ? ` and last ${wallet.config.unlockDays} days` : ""}.</>}</p>
          <button type="button" onClick={() => go("hype")} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold hover:bg-raised">
            <Icon name="coin" size={15} /> <span className="font-mono">{(wallet?.balance ?? me.hype ?? 0).toLocaleString("en-NG")}</span> Hype
          </button>
        </div>
        <StylePicker
          value={style}
          onChange={setStyle}
          name={me.displayName}
          handle={me.handle}
          avatarUrl={me.avatarUrl ?? null}
          access={wallet ? (k) => styleAccess(wallet, k) : undefined}
          onLocked={setUnlocking}
          onSave={saveDesign}
          onUnlockAll={unlockAll}
          balance={wallet?.allFree ? undefined : wallet?.balance}
          onGetHype={() => go("hype")}
        />
        {unlocking && (
          <UnlockDialog
            key={unlocking}
            k={unlocking}
            wallet={wallet}
            me={me}
            onClose={() => setUnlocking(null)}
            onGetHype={() => go("hype")}
            onDone={(w) => {
              setWallet(w);
              // back in the picker they came from, which saves it
              setUnlocking(null);
            }}
          />
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
            Save banner
          </Button>
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => setStyle(saved)}>
              Undo changes
            </Button>
          )}
        </div>
      </form>
      <ProfilePreview me={me} draft={{ ...aboutOf(me), ...style }} />
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, status, signOut, requireAuth } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("account");
  // phones show the list of categories first, then one category at a time
  const [menu, setMenu] = useState(true);
  const [busy, setBusy] = useState<"out" | "all" | null>(null);

  const select = useCallback((t: Tab) => {
    setTab(t);
    setMenu(false);
    try {
      history.replaceState(null, "", `#${t}`);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0 });
  }, []);

  // Deep links (/settings#profile, #privacy, the old #safety…) open that category.
  useEffect(() => {
    // ?tab=hype (where Paystack and notifications send people) or #hype; the old #points and #rank too
    const t = HASH[window.location.hash.slice(1)] ?? HASH[new URLSearchParams(window.location.search).get("tab") ?? ""];
    if (t) {
      setTab(t);
      setMenu(false);
    }
    // a link to another category while already here (/settings#hype from the account menu)
    const onHash = () => {
      const h = HASH[window.location.hash.slice(1)];
      if (h) {
        setTab(h);
        setMenu(false);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  if (status === "loading") {
    return (
      <div className="space-y-4 p-8" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    );
  }
  if (status === "anon" || !user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState icon="user" title="Sign in to manage your settings" action={<Button variant="primary" onClick={() => requireAuth()}>Sign in</Button>}>
          Your profile, appearance and privacy settings live with your account.
        </EmptyState>
      </div>
    );
  }

  async function everywhere() {
    if (!window.confirm("Sign out on every device? You'll need to sign in again everywhere.")) return;
    setBusy("all");
    try {
      await AuthService.logoutEverywhere();
      await signOut().catch(() => {});
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  }
  const out = () => {
    setBusy("out");
    void signOut().finally(() => setBusy(null));
  };

  const list = (
    <nav aria-label="Settings" className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="eyebrow mb-1.5 px-2.5">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => select(it.id)}
                  aria-current={tab === it.id && !menu ? "page" : undefined}
                  className={cx("flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-left text-[15px] font-medium transition md:h-9", tab === it.id ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                >
                  <Icon name={it.icon} size={17} /> {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-line pt-3">
        <button type="button" onClick={out} disabled={busy === "out"} className="flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-left text-[15px] font-medium text-danger transition hover:bg-danger/10 md:h-9">
          <Icon name="logout" size={17} /> Log out
        </button>
      </div>
      <p className="px-2.5 font-mono text-[11px] text-ink-muted">klique · @{user.handle}</p>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-canvas md:flex">
      {/* ------------------------------ categories ------------------------------ */}
      <div className={cx("bg-surface max-md:min-h-dvh md:flex md:flex-1 md:justify-end", menu ? "block" : "hidden md:flex")}>
        <div className="w-full px-4 pt-5 pb-10 md:sticky md:top-0 md:h-dvh md:w-[17.5rem] md:overflow-y-auto md:px-3 md:pt-14 md:pb-8">
          <div className="mb-5 flex items-center justify-between md:hidden">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Settings</h1>
            <button type="button" onClick={close} aria-label="Close settings" className="inline-flex size-9 items-center justify-center rounded-full border border-line text-ink-muted">
              <Icon name="x" size={17} />
            </button>
          </div>
          {list}
        </div>
      </div>

      {/* ------------------------------ page ------------------------------ */}
      <div className={cx("min-w-0 md:flex-[2.1]", menu ? "hidden md:block" : "block")}>
        <div className="flex gap-10 px-4 pt-5 pb-24 md:px-10 md:pt-14">
          <main id="main" className="min-w-0 flex-1 md:max-w-[46rem]">
            <div className="mb-6 flex items-center gap-2">
              <button type="button" onClick={() => setMenu(true)} aria-label="Back to settings menu" className="-ml-1 inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised md:hidden">
                <Icon name="arrow-left" size={18} />
              </button>
              <h1 className="text-xl font-semibold tracking-[-0.02em]">{TITLES[tab]}</h1>
            </div>
            {tab === "account" && <AccountTab me={user} go={select} onSignOut={out} onEverywhere={everywhere} busy={busy} />}
            {tab === "profile" && <ProfileTab me={user} />}
            {tab === "style" && <StyleTab me={user} go={select} />}
            {tab === "hype" && <HypeTab me={user} onStyle={() => select("style")} />}
            {tab === "privacy" && (
              <div className="space-y-6">
                <PrefsSections me={user} />
              </div>
            )}
            {tab === "blocked" && (
              <Block title="People you've blocked" intro="People you've blocked can't message you. Unblock someone to let them back in.">
                <BlockedList />
              </Block>
            )}
            {tab === "notifications" && (
              <div className="space-y-6">
                <Block title="What you hear about" intro="Only things addressed to you or waiting on you. Several of the same kind bundle into one line. Ordinary chat never notifies; it shows as unread dots and counts.">
                  <NotificationSettings />
                </Block>
                <Block title="This browser" intro="Push to this computer or phone browser. The app on your phone asks separately.">
                  <DeviceSettings />
                </Block>
              </div>
            )}
            {tab === "appearance" && (
              <div>
                <Block title="Mood" intro="Pick the look of klique. It applies instantly and follows you across devices.">
                  <MoodPicker />
                </Block>
                <Block title="Animations" intro="Name effects, picture frames, profile effects, stickers and other motion. Saved on this device.">
                  <MotionPicker />
                </Block>
                <Block title="Data saver" intro="Use less mobile data: lighter pictures, GIFs and videos wait for a tap, and nothing loads in the background. Saved on this device.">
                  <DataSaverPicker />
                </Block>
                <Block title="Videos" intro="How videos in the feed behave. Saved on this device.">
                  <AutoplaySwitch />
                </Block>
              </div>
            )}
          </main>
          <div className="hidden shrink-0 md:block">
            <button type="button" onClick={close} aria-label="Close settings (Esc)" className="group sticky top-14 flex flex-col items-center gap-1.5">
              <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-ink-muted/60 text-ink-muted transition group-hover:border-ink group-hover:text-ink">
                <Icon name="x" size={17} />
              </span>
              <span className="font-mono text-[11px] font-semibold text-ink-muted">ESC</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Feed videos playing by themselves (muted) as they come into view. Data saver on overrides it. */
function AutoplaySwitch() {
  const auto = useAutoplay();
  const { on: saver } = useDataSaver();
  return <Switch label="Autoplay videos" hint={saver ? "Data saver is on, so videos wait for a tap anyway." : "Videos in the feed play muted as you scroll to them. Off: tap one to play it."} checked={auto} onChange={setAutoplay} />;
}

/** Animations for this device: follow the device's reduce-motion setting (the default), always on, or off. */
function MotionPicker() {
  const { reduce, pref, deviceReduce } = useMotion();
  const options: { id: MotionPref; title: string; hint: string }[] = [
    { id: "device", title: "Follow my device", hint: deviceReduce ? "Your device asks for less motion, so animations are off now." : "Animations play unless your device asks for less motion." },
    { id: "on", title: "Always on", hint: "Animations play even if your device asks for less motion." },
    { id: "off", title: "Off", hint: "Everything stays still." },
  ];
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Animations">
      {options.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-raised p-3 transition has-[:checked]:border-accent-text has-[:checked]:bg-surface">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{o.title}</span>
            <span className="block text-xs text-ink-muted">{o.hint}</span>
          </span>
          <input type="radio" name="motion" checked={pref === o.id} onChange={() => setMotion(o.id)} className="size-4 accent-[var(--accent-text)]" />
        </label>
      ))}
      <p className="pt-1 text-xs text-ink-muted" aria-live="polite">
        Animations are <span className="font-semibold text-ink">{reduce ? "off" : "on"}</span> right now.
      </p>
    </div>
  );
}

/** Data saver for this device: Auto (follows the browser's Save-Data setting and slow connections), On or Off. */
function DataSaverPicker() {
  const { on, pref, slow } = useDataSaver();
  const options: { id: DataSaverPref; title: string; hint: string }[] = [
    { id: "auto", title: "Automatic", hint: slow ? "Your connection looks slow or Data Saver is on in your browser, so it's on now." : "Turns on by itself on a slow connection or when your browser's Data Saver is on." },
    { id: "on", title: "Always on", hint: "Lighter pictures everywhere. Tap a GIF or video to load it. Profile effects show a still frame." },
    { id: "off", title: "Off", hint: "Full-size pictures, GIFs play, things load ahead of time." },
  ];
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Data saver">
      {options.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-raised p-3 transition has-[:checked]:border-accent-text has-[:checked]:bg-surface">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{o.title}</span>
            <span className="block text-xs text-ink-muted">{o.hint}</span>
          </span>
          <input type="radio" name="data-saver" checked={pref === o.id} onChange={() => setDataSaver(o.id)} className="size-4 accent-[var(--accent-text)]" />
        </label>
      ))}
      <p className="pt-1 text-xs text-ink-muted" aria-live="polite">
        Data saver is <span className="font-semibold text-ink">{on ? "on" : "off"}</span> right now.
      </p>
    </div>
  );
}
