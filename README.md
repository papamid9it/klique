# klique.

Find your people. Community and local-event discovery for **Lagos and Abuja** — skate, alté & indie, streetwear, photography, running, art, film and dance.

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · MongoDB via Mongoose.

## Run it locally

```bash
npm install
cp .env.example .env.local     # then edit it (see below)
npm run seed                   # sample Lagos + Abuja data (needs MongoDB running)
npm run dev                    # http://localhost:3000
```

**MongoDB** — either:
- local: install MongoDB Community and use `MONGODB_URI=mongodb://127.0.0.1:27017/klique`, or
- Atlas: create a free cluster, add your IP, and paste the `mongodb+srv://…` string.

**AUTH_SECRET** — required, 32+ random characters: `openssl rand -base64 48`.

Seed accounts all use the password `klique-demo-1234` (override with `SEED_DEMO_PASSWORD`; local dev only):
- `tobi@demo.klique.ng` — community admin, has an unread message
- `ngozi@demo.klique.ng` — owns the private "Ikoyi Studio Heads", has a pending join request
- Try invite links `/invite/ikoyi-studio-demo` and `/invite/night-riders-demo`.

`npm run seed:reset` wipes every klique collection first. Never run it against production.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (moods CSS is regenerated automatically) |
| `npm run typecheck`, `npm run lint` | static checks |
| `npm run check:contrast` | WCAG contrast check for all 10 moods |
| `npm run check:policies` | unit checks of the privacy/role rules |
| `npm run check:unfurl` | link-preview SSRF guard, OpenGraph parsing, @mention parsing |

## Architecture: frontend separated from backend

```
server/            backend only — never imported by UI code
  models/          Mongoose schemas (users, communities, subcommunities, memberships,
                   membership requests, invitations, posts, events, RSVPs, conversations,
                   messages, blocks, reports)
  policies/        access.ts — the ONE place that decides who may see/do what
  services/        business logic; every service calls the policies
  validators/      zod schemas for every request body and query
  http/            withApi() wrapper: origin check → rate limit → auth → envelope + errors
app/api/           thin route handlers → services          (the HTTP contract)
lib/types.ts       DTOs shared by backend and every client  (the data contract)
app/ApiCore.ts     the only HTTP client
app/services/*     AuthService, EventService, CommunityService, SpaceService, … (your style)
app/(app), (auth)  UI: client components that use only app/services
components/        ui kit, domain components, providers, layout
```

A mobile or desktop app reuses `app/ApiCore.ts`, `app/services/*` and `lib/types.ts`:

```ts
ApiClient.configure({ baseUrl: "https://api.getklique.app", native: true, getToken: () => storedToken });
const { data } = await AuthService.login(email, password);   // data.token when native
```
Native clients send `Authorization: Bearer <token>`; the web app uses an httpOnly cookie and never receives the token in JSON. Set `NEXT_PUBLIC_API_URL` and `ALLOWED_ORIGINS` (see `.env.example`) for a separately hosted client; `proxy.ts` answers CORS for listed origins only.

## Privacy, communities & messages — enforced on the server

- **Private communities** never appear in discovery/search; non-members get a minimal locked card (no description, count, posts, members or events). Entry is by invite link or admin approval.
- **Groups (subcommunities)** belong to one parent, with their own members/posts/events. Every group is private and holds at most 50 people: nobody joins, the group's owner and admins add people who are already in the community (`POST …/groups/[subSlug]/members/add`). Only its members, the community's owner and site admins can see a group; to everyone else it returns 404, and its events stay inside it. The Groups folder only appears once you're in a group. Run `npm run migrate:groups` once on an existing database.
- **Roles**: owner / admin / member; admins handle requests, invites, removals and bans; only owners change roles or privacy.
- **Events** carry an audience (`public`/`community`/`subcommunity`) applied in every list, search, profile and report query.
- **Direct messages**: one conversation per pair (unique key), readable only by its two participants on every request, unread counts, DM policy (everyone / shared communities / nobody), block and report. Message content never appears on profiles, feeds, search or event pages.
- Hiding a button is never the control — every endpoint re-checks via `server/policies`.

## Community chat (channels, groups, mentions, link embeds)

A community is a chat space, laid out like Discord/Slack with a forum's structure:

- **Far left (rail):** your communities as tiles (generated art + name) so you can hop between them; unread dot, @mention count, active marker. On mobile the same strip sits at the top of the channels drawer.
- **Left:** the community header, Events / Groups / Members / Manage views, **categories → channels**, then a section per **group** you're in, each with its own channels. Owners/admins manage channels right there.
- **Middle:** the conversation. Newest at the bottom; **scroll up for older messages** (no "next" button; your place is kept). New messages arrive by polling every 4 s. Enter sends, Shift+Enter adds a line.
- **Right:** community info (or group info while inside a group). Only the **home page** has the suggestions rail now; every other page gets the full width.

**Groups** (sub-communities) have their own chat: #announcements and #general by default, more channels by the group's admins. Joining a group also makes you a member of its parent (public parent: automatic; private parent: you must already be in). Who may create groups is a community setting: only admins (default), any member, or off. Old `/groups/<slug>` links redirect to `/communities/<slug>?g=<slug>`.

**Private channels:** a channel is visible to *everyone who can see the space*, *admins only*, or *invite-only* with a guest list (owners/admins can always see it). Hidden channels return 404, not 403.

**@mentions:** type `@` for suggestions. Only people who can read that channel can be tagged (and not people who blocked you or you blocked). Tagged messages highlight for them and add to the unread mention badge (capped at 99).

**Reactions and stickers** (channels *and* private messages): hover a message for the 😊 button — like, dislike, love, laugh, wow, cry, angry — and tap a chip to add or remove yours. You get **one reaction per message**: picking another replaces it. The sticker button in the composer sends one of 20 big animated emoji stickers. They're animated with CSS (no images to host; switched off for people who prefer reduced motion). Lists are in `lib/reactions.ts`; add one there and it works everywhere. Only members can react in a channel, and in a DM only the two people (and not across a block). Reaction counts of other people refresh with the 4 s chat poll.

**Groups:** inside a group the left panel is only that group: a back button to the community, the group's Events, Members and Manage (group admins only), and the group's own channels. In the community itself groups aren't listed, just the **Groups** folder.

**Link embeds:** pasted links become cards: YouTube/Vimeo as click-to-play (privacy-friendly youtube-nocookie), direct video/image inline, everything else as an OpenGraph card. The server fetches the page (`server/services/unfurl.service.ts`) with SSRF protection: public http(s) only, ports 80/443, DNS-pinned, redirects re-checked, 5 s / 400 KB limits, cached, rate limited, sign-in required. `og:image` is loaded by the viewer's browser directly (no-referrer), so the image host sees their IP; proxy it if that matters to you.

Rules (enforced in `server/policies/access.ts` + services, never by the UI):

- Reading follows the space (public: anyone; private: members). Posting needs membership. Announcement channels: only owner/admins post.
- Owners/admins can delete messages from lower ranks; authors delete their own (soft delete). Members can report messages; blocked people are filtered out.
- Default channels are created once per space; deleting them never brings them back.
- API: `/api/communities/[slug]/channels…` and `/groups/[subSlug]/channels…`, `/api/me/communities`, `/api/unfurl`; client side `app/services/ChannelService.ts`, `LinkService.ts`. Paging uses message-id cursors, so mobile/desktop apps can reuse it.

Re-run `npm run seed:reset` for demo data (every community now has a cover photo from picsum.photos; 130 messages in the first community, group chats, a private #filming-crew channel, mentions, a YouTube link). The channel slug index changed shape (unique per community/group); the app rebuilds it automatically on first use. `npm run check:unfurl` tests the link-preview and mention logic.

## Messages and friends

`/messages` is a Discord-style workspace: **left** = Friends, Friend requests (with a badge) and everyone you're chatting with (search, unread counts, live refresh); **middle** = the conversation (or the Friends hub); **right** = the person's card (bio, interests, communities you share, friend button, block/report). On phones it shows one pane at a time.

Friends hub (`/messages/friends`): **All**, **Pending** (received and sent) and **Add friend** by handle, plus **People you may know** (people who share communities with you, most in common first; never blocked or private profiles). API: `/api/friends…`, client `app/services/FriendService.ts`.

Rules (server-side): one request per pair; if they already asked you, asking back accepts; only the person asked can accept or decline; blocking ends a friendship and hides requests; asking someone who blocked you looks exactly like "no such user"; friends can always message each other whatever their message privacy says.

## Profile card and profile modal

Clicking anyone's name, avatar or @mention (chat messages, DMs, member and admin lists, friends, event attendees, people search) opens a **small profile card** next to it (a bottom sheet on phones): banner, avatar, name, @handle, short bio, member since, mutual communities, Message / friend button / "⋯" menu. Clicking the name or **View full profile** opens the **big profile modal**: identity and actions on the left (About, member since, friends since, interests), tabs on the right: **Activity** (going to / hosting), **Mutual friends** and **Mutual communities** as list rows with cover tiles. Clicking a mutual friend switches the modal to them. Mounted once in `components/providers/ProfileCardProvider.tsx`; use `<ProfileTrigger handle>` or `useProfileCard().open/openFull`. `/people/[handle]` still works for deep links ("View as a page" in the "⋯" menu). The profile API now also returns `mutualFriends` and `friendship.since`.

## Places, "where am I looking" and the events page

klique isn't tied to a city. Everyone, every community and every event has a **country · state/region · city** (`lib/places.ts`: all 54 African countries plus major countries elsewhere, Nigerian states, Ghana regions, South African provinces, Kenyan counties and a city list; any other town can be typed freely). Add a country, state or city in that one file and it appears in every picker.

**Scope** = where you're looking: `world`, `continent:africa`, `country:NG`, `region:NG:lagos` or `city:NG:lagos`. The sidebar / top-bar place button opens a picker (search any place, or drill continent → country → state → city; "All of Ghana" at each level). It's remembered, starts at your own city, and drives Events, Communities, People, Discover and search (API param `where`).

Events page (`/events`): "Events in [place ▾]", quick shortcuts (near me / my country / my continent / everywhere), search, In person / Online, Free, date pills, interest pills, grid or list grouped by day, a month calendar with a dot on every day that has events (click a day to filter), and a "Browse countries / states / cities" panel with live counts (`GET /api/events/overview`). Events have a **currency** (defaults to the country's) and an **online** flag. Times are still shown in Lagos time (WAT); per-event time zones are not done yet.

## Moods

Ten moods in `lib/moods.ts` set canvas, surface, ink, line and two accents as CSS variables (`npm run build:moods` → `app/moods.css`). Switching applies instantly, persists in localStorage (no flash on reload) and, when signed in, in your account.

## Not done / needs configuration

- Chat is polling-based (4 s), with no typing indicators, reactions, replies, attachments or channel reordering yet. For true realtime, add a WebSocket/SSE layer or a service such as Ably/Pusher on top of `postMessage`.

- **Images**: avatars and covers take an upload (Cloudflare R2, see below) or an `http(s)` URL; without one the app draws generative cover art in the current mood.
- **Payments**: prices (₦) are displayed; there is no ticketing or checkout.
- **Rate limiting** is in-memory (one process). Use a shared store (Redis/Upstash) for multi-instance deployments.
- **Real-time DMs** use polling, not WebSockets. No email/push notifications.
- **Moderation**: reports are stored in the `reports` collection; there is no admin review UI yet.
- **WhatsApp sharing** uses `wa.me` links. Rich link previews (Open Graph) for event/community pages are not implemented — pages are client-rendered.
- Production: set a strong `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` to your HTTPS origin, and serve over HTTPS (cookies become `Secure`).

## Settings

`/settings` is a full-screen, Discord-style User Settings view: a left category list (My Account, Profile, Privacy & Safety, Appearance, Log out) and a content pane with a close button (Esc). Deep links like `/settings#profile` and `/settings#privacy` select a tab. On phones it shows the category list first, then one category at a time.

## Community, channel and group management (Discord-style)

- The community (or group) name in the left pane is a dropdown: Invite people, Community settings, Create channel / category / group, Leave, Report. There is no standing "Manage" button.
- Every channel row has an options dropdown (Edit channel, Permissions, Copy link, Delete); categories have a "+" and a "…" dropdown. Shared menu: `components/ui/Dropdown.tsx` (portal, keyboard support).
- Settings are full-screen layers (`components/ui/SettingsShell.tsx`) with an "unsaved changes" bar: `?settings=overview|groups|members|requests|invites|privacy|delete` for a community, `?g=<group>&settings=...` for a group, and `ChannelSettings` for a channel. Old `?view=manage` links still open them.
- Creating: "Create channel" is a Discord-style dialog (type cards, name, private switch); `/communities/new` is a 3-step wizard.

## Topics (Reddit-style boards) and message editing

- **Boards:** admins name their own topic sections (Updates, Projects, Questions…), create as many as they like (up to 12) and choose per board whether everyone or only owners/admins can post. They appear under "Boards" in the community sidebar (`?view=topics&b=<board>`). A community with no boards gets a default "Topics" one, and older topics move into it. API: `/api/communities/[slug]/boards[/<id>]`; client: `TopicService.boards/createBoard/updateBoard/removeBoard`; UI: `components/domain/topics/BoardFormModal.tsx`. Deleting a board removes its topics.

- **Topics:** every community has a *Topics* view next to its Discord-style channels (`?view=topics`, a single topic at `?view=topics&t=<id>`). Members create topics (title, text, optional image link), comment in threads (replies nest, collapse and cap their indent), like topics and comments, and edit their own. Owners/admins can pin, lock (no new comments) and delete. Sort by Hot, New or Top, and search. API: `/api/communities/[slug]/topics/...`; client: `app/services/TopicService.ts`; UI: `components/domain/topics/`.
- **Home feed:** *For you* mixes topics from communities you've joined (`/api/me/topics`) in with nearby events.
- **Editing chat:** your own messages can be edited in community channels and in DMs (⋯ menu → Edit message, Enter saves, Esc cancels). Edited messages show "(edited)"; other people's edits arrive through polling. Stickers can't be edited, and deleted messages show "Message deleted".
- Re-run `npm run seed:reset` to get sample topics, comments and likes.
- **Topic media:** topics can carry up to 6 pictures (swipeable gallery) or one video. Uploads aren't built yet, so the form offers sample files (`public/mock/`) and pasted links. The seed adds a gallery, a video and a single picture.

## Uploads (Cloudflare R2), voice (LiveKit), pictures/replies/pins in chat

**Cloudflare R2, compressed on the device.** Pictures and videos are resized and compressed in the browser before upload (`lib/media-compress.ts`): profile pictures become a 512px square, photos at most 1920px plus a 640px copy for thumbnails (WebP, JPEG where WebP isn't available, GIFs kept as they are), videos at most 1280px H.264 MP4 (VP9 WebM where the browser can't encode H.264, via mediabunny) plus a still frame. `POST /api/uploads/sign {kind, files}` checks each file's type and size and returns one short-lived signed PUT link per file (type, exact size and cache header are part of the signature), and the client uploads straight to R2. Set the five `R2_*` values (see `.env.example`, including the bucket's CORS policy); leave them empty and upload buttons fall back to pasting a link. `lib/cdn.ts` picks the small copy for thumbnails.
- Service: `app/services/UploadService.ts` (`status`, `sign`, `upload(kind, file, {onProgress})`). A phone or desktop app calls the same three functions; only the file object differs (wrap a picked file as a Blob with a `name`).
- Used for: profile picture (Settings → Profile), community and event covers, topic pictures and video, pictures in channel chat and private chat (paste or attach, up to 4).

**Voice channels (LiveKit).** Create a channel of type *Voice*. Audio runs on LiveKit Cloud, not on your server; the free "Build" plan includes 5,000 participant-minutes a month with no card. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. `POST …/channels/[slug]/voice` checks that you are a member who can see the channel and returns a one-hour token for that room (`ChannelService.joinVoice`). The panel offers join, mute, deafen and leave, shows who is speaking, and hangs up when you leave the page. Not configured, it tells people voice isn't set up. Video and screen share are not built.

**Chat.** Reply to a message (a quote above the reply, click to jump), pictures in messages, and pinned messages in channels (owners and admins pin; a bar above the chat lists them).

**Not built yet (roadmap).** Custom roles and per-channel permissions, typing indicators and online presence (these need a realtime connection), push notifications, message search, event discussion threads and calendar export, threads inside channels, reporting topics and comments.

## Realtime (Ably)

Chat, DMs, unread dots and topic comments update instantly through [Ably](https://ably.com) (free plan). Set `ABLY_API_KEY` (server only, see `.env.example`) and restart.

- **How it works:** after a write, the server publishes a tiny ping ("something changed in channel X") on `community:<id>` or `user:<id>`. Open clients receive it and refetch through the normal, permission-checked API, so no message text ever travels over Ably. Server: `server/services/realtime.ts`; browser: `components/providers/RealtimeProvider.tsx` (`useRealtimeEvent`); client service: `app/services/RealtimeService.ts`.
- **Security:** `GET /api/realtime/token` hands out a short-lived, listen-only Ably token limited to your own `user:` channel and the communities you belong to (re-issued when you join or leave one). Clients can't publish.
- **Fallback:** with no key, or if the connection drops, screens keep polling (chat every 4s). While the live connection is up, polling slows to a 30 to 180 second safety net.

## Accounts: Google, email verification, password reset, cache

- **Pages:** `/login` and `/signup` (two steps, Discord-style), `/forgot-password`, `/reset-password`, `/verify-email`. Settings → My Account has *Change password* (or *Add a password* for Google-only accounts) and the email's verified status.
- **API** (all in `app/api/auth/*`, called through `app/services/AuthService.ts`): `config`, `verify`, `verify/resend`, `forgot`, `reset` (PUT checks a link, POST uses it), `password`, `google`, `google/callback`.
- **Email** is plain SMTP (`server/mailer.ts`, nodemailer), so any provider works: Brevo's free plan is the easiest because it only needs a verified sender address. With `SMTP_HOST` empty the messages are printed to the server console, and unverified accounts are *not* restricted. Once SMTP is set, creating a community or an event needs a confirmed email. Reset and verify links are single-use, stored hashed, and expire (1 h / 24 h). The forgot-password form answers the same whether or not the address has an account.
- **Google** uses the plain OpenID Connect code flow (`server/services/google.service.ts`): a signed, short-lived state cookie plus a nonce stop forged callbacks, the ID token is verified against Google's keys, and an unverified Google email is refused. A Google email that matches an existing account links to it (and counts as verified); otherwise an account is created with a generated username and the person lands on their profile. The Google flow is web-only for now; native/desktop apps will need their own redirect.
- **Cache** (`server/cache.ts`): Upstash Redis over HTTP, with an in-memory fallback when it isn't configured or is down (a cache problem never fails a request). It holds the rate limits for every endpoint that has one (login, signup, forgot, reset... shared by all server instances) and a 45-second shared copy of the signed-out Discover, Events overview and Communities lists, refreshed immediately when a community or event is created. Signed-in requests are never served from it.
- Existing accounts have no verified email yet: they see a banner (only when SMTP is configured) and can resend the link from the banner or Settings.

## Mobile app

A React Native (Expo + NativeWind) app lives in `mobile/`. It reuses the same service layer and API. See `mobile/README.md` for setup and the list of features not yet on mobile.

### Profile style (banners, frames, name effects)

Every profile can have a banner (picture or colour), one of 20 animated picture frames and one of 20 name effects. They are free, stored on the user (`bannerUrl`, `bannerColor`, `avatarFrame`, `nameEffect`) and defined in `lib/cosmetics.ts`. Web draws them with CSS (`app/globals.css`), mobile with `Animated` views. The "Paper Mono" mood is the light companion to Monochrome.

### Notifications and trending

- Phone pushes: see `mobile/README.md` (server code in `server/services/push.service.ts`, device tokens in the `PushToken` model, `/api/me/push`). Needs `CRON_SECRET` plus a free scheduler hitting `/api/cron/reminders` for "starts soon" reminders.
- The home page "Trending now" shows topics with at least 30 comments (`TRENDING_MIN_COMMENTS` in `lib/constants.ts`) from the last 21 days, from communities the viewer can see. With none, the section is not shown.
- Monochrome is the default mood. People who already picked a mood keep theirs.
