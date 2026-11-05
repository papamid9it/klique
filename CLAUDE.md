# Klique: notes for Claude

Put this file in the root of the Klique repo (`~/Documents/klique/CLAUDE.md`). Claude Code reads it automatically.

## What Klique is
A social app for finding your people and going out in Lagos and Abuja: communities (Discord-style channels, roles, threads, bots), posts (Instagram-style feed), events, and "kliques" (small groups going to an event together). Domain: getklique.app, hosted on Vercel. Owner: Jonah.

## Stack
- Next.js 16 (App Router), React 19, Tailwind v4, TypeScript. Server code is in `server/` (Mongoose 9 models, services, validators, serializers). Client API wrappers are in `app/services/`.
- MongoDB Atlas. Production database name: `test`. Dev database: `klique-dev`, which `.env.local` points at.
- Cloudflare R2 for all media (bucket `database`), compressed before upload. No Cloudinary.
- Ably for live updates, with polling fallback. Upstash Redis.
- Paystack for payments: Lite ₦2,000/mo and Pro ₦5,000/mo subscriptions, donations, ads. Use a TEST key locally.
- Auth is custom: a jose HS256 cookie `klique_session`, Google sign-in in `server/services/google.service.ts`, native/desktop handoff via `klique://auth` plus `/api/auth/exchange` (PKCE).
- One-time data migrations run automatically on first DB connect (`server/db.ts`, `server/migrations/`). New indexes need `npm run db:indexes` run once against production.

## Rules (important)
- **Never commit or push.** Jonah commits himself.
- **Never touch production data.** Test only on klique-dev. Never run `npm run seed*` against production; there's a guard in `scripts/seed-guard.ts`.
- Don't edit `.env*` files and don't print secret values (variable names are fine).
- Don't run code formatters across the repo.
- Test clean-up removes only what the test created.
- No screenshots saved inside the repo.
- Jonah often pauses `npm run dev` with Ctrl+Z, so a stuck port needs `kill -9`.
- Demo logins on klique-dev: tobi@demo.klique.ng (site admin), amara@ (Lite), kunle@, sade@ (Pro); password in `SEED_DEMO_PASSWORD`.

## Style Jonah likes
Instagram-style, clean. No glows, no pinned or sticky save buttons. Follow standard patterns (Reddit, X, Discord) when unsure. Mood/theme default follows the device (Paper Mono light / Monochrome dark) unless the user picks one. Short, plain explanations.

## Product decisions already made
- Plans: Free / Lite / Pro limits are set in Admin → Plans (kliques, gallery 2/4/6, communities, groups, bots 2/5/10, emoji 20/50/100). Badges: Pro blue, Lite silver, verified community gold, **Klique Team** (site admins via ADMIN_EMAILS) black with a crown. One badge per name. A community role's emoji shows on the avatar's bottom-right, only inside that community.
- Kliques: event, one community, or All communities. All communities has no community, needs a country and city, and anyone can see and join it; "Kliques for you" offers it only to people with its interest. A community's kliques show in the kliques list and "Kliques for you" only to its members; its own page and direct links still show them with a way to join. Interest and cover picture are required. "Spots for others" 1–99 (stored as a total that includes the host); closed to new people once the event starts; hidden once ended; auto-deleted a day after (TTL index). Full kliques show "Full" and are left out of "Kliques for you".
- Ads bought in the phone app are paid by in-app purchase (Apple, Google), not Paystack: consumable products `ads_<naira>` from `AD_STORE_TIERS` in `lib/ads.ts`, priced at the nearest tier at or above the ad's price, and checked with the store in `server/services/store-billing.service.ts`. `STORE_IAP_ALLOW_TEST=1` accepts free test purchases: only for test builds and App Review.
- Home's events are mixed by the server (`server/services/event-mix.ts`, sent as `eventsForYou`): different per person, changes every 10 minutes, and interests, people going and soon only raise the odds. Don't sort them again in the apps. Between posts, `lib/feedMix.ts` (copied to the app by `npm run sync`) places random event, klique and ad cards.
- Every account is in "Klique HQ" and can't leave. Only site admins post events there.
- Feed refresh is Reddit-style: a "↑ New posts" pill, clicking Home or Posts again, F5 in the desktop app, and a back-to-top button. Posts and comments use an idempotency key, so there are never duplicates.
- 18+ communities are private only; explicit content is opt-in, web only.
- Voice chat is off (`VOICE_ENABLED`). File uploads and voice notes in chat were dropped for now.

## Desktop app (Electron)
Source is in `klique-desktop-source.zip` from the project files. Keep it in its own folder, e.g. `~/Documents/klique-desktop`. Build with `npx electron-builder --linux --win --publish never` (needs rpm, libarchive-tools/bsdtar and wine for the Windows installer). Releases go to R2 bucket `klique-downloads` under `desktop/<version>/`, plus `desktop/latest.json` (public at https://pub-9192d32c2cf64dfb8fc2e2c5e8e046c2.r2.dev). The site reads that for `/download` and `/api/app/version`, with a fallback list in `lib/desktop-release.ts`. Current live version: 1.2.0. Upload the files first, then latest.json last. Mac builds need the GitHub Actions workflow in the source.

## Phone app (Expo)
Not in this repo yet. An older copy (18 Oct) of the Expo app is in the project files under `kliq/klique mobile/mobile/` (NativeWind; it shared app/services via `npm run sync`). It needs updating to today's API: the native sign-in flow is `/api/auth/google?client=native&redirect=klique://auth&challenge=…` then `POST /api/auth/exchange` with header `X-Klique-Client: native` to get a token, then `Authorization: Bearer`. Phone-specific rules: no explicit-content toggle, and paid features need Apple/Google in-app purchase or web-only checkout.

## Open items when this was written (4 Nov 2026)
- Done but not yet committed on 4 Nov: right panel scrolls with the "Change the mood" bar pinned; community Members visible only to owner, admins and moderators (UI and server, @mentions still work); saving spinner plus "Saved" on community settings (`lib/hooks/useAutoSave.ts`); back-to-top button sits in the gap beside the posts on big screens.
- To do on production after pushing: `MONGODB_URI='<live uri>' npm run db:indexes`. Check ADMIN_EMAILS in Vercel has real admins only (no demo emails).
- Optional: clean duplicated test posts on klique-dev with `npm run seed:feed -- --clean --yes` then `npm run seed:feed -- --yes`.
- Launch checklist: `vercel-launch-checklist.md` in the project files (R2 CORS, Paystack webhook, Google redirect, CRON_SECRET, VAPID keys, lawyer review of terms).
