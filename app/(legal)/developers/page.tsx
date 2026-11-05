import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/domain/legal/Legal";
import { appUrl } from "@/server/env";

export const metadata: Metadata = { title: "Webhooks and bots", description: "How to connect GitHub and other apps to klique communities with webhooks, and how to build bots and slash commands." };

const Code = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded-control border border-line bg-raised p-3 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>;

export default function DevelopersPage() {
  const site = appUrl();
  return (
    <LegalDoc
      title="Webhooks and bots"
      updated="5 November 2026"
      intro={
        <p>
          Two ways to bring other tools into your community. A <strong>webhook</strong> is a secret link that lets another app post into one channel, with no coding. A <strong>bot</strong> is a program that joins your community, reacts to what happens and answers commands. Someone has to build and host it.
        </p>
      }
    >
      <Section n={1} title="Make a webhook" id="webhooks">
        <ul>
          <li>Open your community&apos;s settings, then Webhooks, and press New webhook. Only the owner can, or a role they gave “Manage webhooks and bots”.</li>
          <li>Give it a name, pick the channel it posts in, then copy its link. For safety the link is only shown once. If you lose it, press New link and the old one stops working.</li>
          <li>Paste the link into the other app, or send it a message yourself:</li>
        </ul>
        <Code>{`curl -X POST "YOUR_WEBHOOK_LINK" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "New event tonight at 8pm!", "username": "Event bot"}'`}</Code>
        <ul>
          <li>Send <code>content</code> (plain text, up to 2,000 characters), <Link href="#cards" className="font-medium text-accent-text underline">cards</Link>, or both. <code>username</code> changes the name shown. <code>avatar_url</code> changes the picture, and must be one uploaded to klique.</li>
          <li>A webhook can post 30 messages a minute. Its messages show a BOT tag, and it can only ping @everyone and @here if you switch that on.</li>
          <li>Anyone with the link can post as the webhook, so keep it secret. Webhooks don&apos;t work in 18+ communities. A community&apos;s bots and webhooks share one limit (2 on Free, 5 on Lite, 10 on Pro, by its owner&apos;s plan).</li>
        </ul>
      </Section>

      <Section n={2} title="Connect GitHub" id="github">
        <ul>
          <li>Make a webhook for the channel you want (see above) and copy its GitHub link. It&apos;s the webhook&apos;s link with <code>/github</code> on the end.</li>
          <li>In your repo on GitHub, open Settings, then Webhooks, then Add webhook. You need to be an admin of the repo.</li>
          <li>Paste the link as the Payload URL. Either content type works, and leave Secret empty.</li>
          <li>Choose “Let me select individual events” and tick what you want, then press Add webhook. A message in your channel confirms it&apos;s connected.</li>
        </ul>
        <p>klique posts <strong>pushes</strong>, <strong>pull requests</strong> (opened, merged, closed, reopened), <strong>approvals and change requests</strong>, <strong>issues</strong> (opened, closed, reopened), <strong>comments</strong>, <strong>releases</strong>, <strong>stars</strong> and <strong>forks</strong>. It skips smaller updates like label changes.</p>
        <ul>
          <li>Repo names, titles and commit messages show to everyone who can see the channel, so pick a private channel for a private repo.</li>
          <li>Anything written on GitHub can&apos;t ping people here, even if the webhook is allowed to use @everyone.</li>
          <li>Past 30 messages a minute, updates are dropped, so leave comments unticked on a very busy repo.</li>
          <li>Nothing showing up? On GitHub&apos;s webhook page, Recent Deliveries shows what klique answered.</li>
        </ul>
      </Section>

      <Section n={3} title="Welcome new members" id="welcome">
        <p>
          <strong>No coding:</strong> in community settings, turn on the welcome screen and choose a greeting channel. Your greeting can use <code>{"{user}"}</code> (pings them), <code>{"{name}"}</code> and <code>{"{community}"}</code>.
        </p>
        <p>
          <strong>With a bot:</strong> listen for the <code>member.join</code> event and post whatever you like, using any information your own program has. A card gives it your own look, and because your bot can make its own picture, the welcome can be your artwork with the new member&apos;s name on it:
        </p>
        <Code>{`if (event.type === "member.join") {
  await fetch("${site}/api/bot/v1/channels/CHANNEL_ID/messages", {
    method: "POST",
    headers: { Authorization: "Bot YOUR_TOKEN", "Content-Type": "application/json" },
    body: JSON.stringify({
      content: \`Welcome @\${event.data.user.handle} 👋\`,
      cards: [{
        color: "#7c5cff",
        title: "Glad you're here",
        text: "Say hi and tell us **what you're building**.",
        image: \`https://your-bot.example/welcome/\${event.data.user.id}.png\`,
        buttons: [
          { label: "Accept the rules", style: "primary", id: "accept-rules" },
          { label: "Read the guide", url: "https://your-site.example/guide" },
        ],
      }],
    }),
  });
}`}</Code>
      </Section>

      <Section n={4} title="Cards and buttons" id="cards">
        <p>Bots and webhooks can post cards as well as words, up to 4 in a message. You describe the card and klique draws it, on the website and in the app, in each person&apos;s own colours. Every part is optional, but a card needs something to show.</p>
        <Code>{`{
  "content": "Words above the card (optional)",
  "cards": [{
    "color": "#7c5cff",
    "title": "Hack night",
    "url": "https://example.com/hack-night",
    "text": "**Bold**, *italic*, \`code\`, line breaks and links.",
    "thumbnail": "https://example.com/logo.png",
    "image": "https://example.com/banner.png",
    "fields": [
      { "name": "When", "value": "Friday, 7pm", "inline": true },
      { "name": "Where", "value": "Yaba", "inline": true }
    ],
    "footer": "Hosted by the tech community",
    "buttons": [
      { "label": "I'm in", "style": "primary", "id": "rsvp-yes" },
      { "label": "Details", "url": "https://example.com/hack-night" }
    ]
  }]
}`}</Code>
        <ul>
          <li><strong>Sizes:</strong> title 200 characters, text 2,000, up to 10 fields (name 80, value 500), footer 200, and 6,000 characters across a message&apos;s cards.</li>
          <li><strong>Colour:</strong> <code>color</code> is the stripe down the card&apos;s side. Everything else uses the reader&apos;s colours, so it stays readable in every mood.</li>
          <li><strong>Pictures and links:</strong> these must be public <code>https</code> links. Your server sees the requests when people load a picture, so don&apos;t use a picture to track people. With data saver on, the app waits for a tap before loading pictures.</li>
          <li><strong>Pings:</strong> @names in a card never ping anyone. To ping someone, put them in <code>content</code>.</li>
          <li><strong>Rules:</strong> a bot&apos;s cards go through AutoMod like any message, and they show up in reports.</li>
        </ul>

        <h3 className="pt-2 font-semibold text-ink">Buttons</h3>
        <ul>
          <li>Up to 5 on a card. A button has a <code>label</code> and either a <code>url</code> (opens the link) or an <code>id</code> (tells your bot). <code>style</code> is <code>primary</code>, <code>secondary</code> or <code>danger</code>, and <code>disabled: true</code> greys it out. Ids must be different within a message.</li>
          <li>Webhooks can only use <code>url</code> buttons, because nothing is listening for a press.</li>
          <li>Only members can press <code>id</code> buttons. They work in read-only channels too, so an “Accept the rules” button is fine in announcements.</li>
        </ul>
        <p>When someone presses an <code>id</code> button, your bot gets a <code>button</code> event:</p>
        <Code>{`{ "type": "button", "data": {
  "community": {…}, "channel": {…}, "user": {…},
  "message": { "id": "…" }, "button": { "id": "rsvp-yes", "label": "I'm in" }
}, "sentAt": "…" }`}</Code>
        <p>Answer within 4 seconds, with any mix of these. Or answer with nothing and act later through the API.</p>
        <Code>{`{ "notice": "You're on the list" }        // only the person who pressed sees this
{ "update": { "cards": [ … ] } }           // changes the card they pressed
{ "content": "Tobi is in!", "cards": [ … ] } // posts a new message`}</Code>
        <p>Keeping a button working is up to your bot: it could get pressed many times, by many people. To stop it, update the card with <code>disabled: true</code>.</p>
      </Section>

      <Section n={5} title="Build a bot" id="bots">
        <p>
          Anyone on Pro can make one in{" "}
          <Link href="/settings#developers" className="font-medium text-accent-text underline">
            Settings → Developers
          </Link>
          . Community owners add it with its invite link and choose what it may do.
        </p>
        <p>Bots can welcome people, moderate, run games and polls, post alerts and answer slash commands.</p>
      </Section>

      <Section n={6} title="How it fits together">
        <ul>
          <li>Your bot has its own account (shown with a BOT tag). When an owner adds it, it joins the community with its own role holding the permissions they gave it. It can only act on people below that role.</li>
          <li>klique sends <strong>events</strong> (things that happened) to your bot&apos;s endpoint. Your bot does things by calling the <strong>bot API</strong> with its token.</li>
          <li>Bots work in community channels and threads. Never in DMs, and never in 18+ communities. A community&apos;s bots and webhooks share one limit (2 on Free, 5 on Lite, 10 on Pro, by its owner&apos;s plan).</li>
        </ul>
      </Section>

      <Section n={7} title="Calling the bot API">
        <p>Send your token in every request. Keep it secret; if it leaks, make a new one in Developers.</p>
        <Code>{`curl -X POST ${site}/api/bot/v1/channels/CHANNEL_ID/messages \\
  -H "Authorization: Bot YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from my bot 👋"}'`}</Code>
        <ul>
          <li><code>GET /api/bot/v1/me</code>: your bot, its commands and the communities it&apos;s in.</li>
          <li><code>GET /api/bot/v1/communities/:communityId/channels</code>: channels it can see.</li>
          <li><code>GET /api/bot/v1/channels/:channelId/messages</code> <code>?limit=&amp;before=&amp;after=</code>: read a channel, if it has <a href="#reading" className="font-medium text-accent-text underline">Read messages</a>. Up to 100 at a time, oldest first.</li>
          <li><code>POST /api/bot/v1/channels/:channelId/messages</code> <code>{`{ content?, cards?, reply_to? }`}</code>: post words (up to 2,000 characters), cards or both.</li>
          <li><code>PATCH</code> / <code>DELETE /api/bot/v1/channels/:channelId/messages/:messageId</code>: edit its own message (<code>{`{ content?, cards? }`}</code>); delete its own, or anyone&apos;s below it with “Delete messages”.</li>
          <li><code>PUT /api/bot/v1/channels/:channelId/messages/:messageId/reactions/:kind</code>: react (again to take it back).</li>
          <li><code>POST /api/bot/v1/communities/:communityId/members/:userId/timeout</code> <code>{`{ seconds, reason }`}</code>: 60, 300, 600, 3600, 86400 or 604800 seconds; 0 lifts it. Needs “Time out members”.</li>
          <li><code>DELETE /api/bot/v1/communities/:communityId/members/:userId</code> (add <code>?ban=1</code> to ban): needs “Remove members” or “Ban members”.</li>
          <li><code>PUT /api/bot/v1/communities/:communityId/members/:userId/roles</code> <code>{`{ roleIds }`}</code>: needs “Manage roles”; only roles below the bot&apos;s.</li>
          <li><code>PUT /api/bot/v1/commands</code> <code>{`{ commands: [{ name, description, options: [{ name, description, required }] }] }`}</code>: register up to 25 slash commands.</li>
        </ul>
        <p>Answers are JSON: <code>{`{ "success": true, "data": … }`}</code> or <code>{`{ "success": false, "message": "…" }`}</code>. Limit: 120 calls a minute. Everything your bot does goes through the same rules as people: permissions, rank, timeouts, AutoMod and the moderation log.</p>
      </Section>

      <Section n={8} title="Events">
        <p>Set a public https address on the normal port (443) in Developers and klique POSTs JSON there. Private addresses and redirects aren&apos;t followed, and answers can be up to 256 KB:</p>
        <Code>{`{ "type": "message.create", "data": { "community": {…}, "channel": {…}, "message": {…} }, "sentAt": "…" }`}</Code>
        <ul>
          <li><code>message.create</code> (needs <a href="#reading" className="font-medium text-accent-text underline">Read messages</a>), <code>reaction</code>, <code>member.join</code>, <code>member.leave</code>, <code>klique.create</code>, <code>event.create</code>, <code>bot.added</code>, <code>interaction</code> (a slash command) and <code>button</code> (a button on a card).</li>
          <li>Answer within 4 seconds with a 2xx. After 50 failures in a row events stop until you save the endpoint again.</li>
          <li>
            Check every event is really from klique: <code>X-Klique-Signature</code> is <code>sha256=</code> + the hex HMAC-SHA256 of <code>{"`${X-Klique-Timestamp}.${body}`"}</code> with your signing secret. Reject old timestamps.
          </li>
        </ul>
        <Code>{`import { createHmac, timingSafeEqual } from "node:crypto";
const sig = createHmac("sha256", SECRET).update(\`\${req.headers["x-klique-timestamp"]}.\${rawBody}\`).digest("hex");
const ok = timingSafeEqual(Buffer.from(\`sha256=\${sig}\`), Buffer.from(req.headers["x-klique-signature"]));`}</Code>
      </Section>

      <Section n={9} title="Reading messages" id="reading">
        <p>Bots don&apos;t get what people write unless a community allows it. Slash commands, button presses, joins and leaves all work without it, so only ask for <strong>Read messages</strong> if your bot needs it.</p>
        <ul>
          <li><strong>It&apos;s the owner&apos;s choice:</strong> it&apos;s off when they add your bot unless they tick it, and they can switch it off any time in community settings, under Webhooks.</li>
          <li><strong>From then on only:</strong> your bot sees nothing written before it was allowed. If it&apos;s switched off and on again, it doesn&apos;t see what was said in between.</li>
          <li><strong>Only channels it can see:</strong> a private channel needs your bot added to it. It never sees group chats, or deleted or hidden messages.</li>
          <li><strong>What changes:</strong> with it, you get <code>message.create</code> events and can read channels. Without it, reading a channel answers 403. <code>GET /api/bot/v1/me</code> shows where you have it.</li>
          <li><code>reaction</code> events only come from channels your bot can see.</li>
        </ul>
        <Code>{`GET /api/bot/v1/channels/CHANNEL_ID/messages?limit=50
{ "success": true, "data": { "messages": [{ "id": "…", "body": "…", "author": {…}, "createdAt": "…" }], "hasMore": false } }`}</Code>
      </Section>

      <Section n={10} title="Slash commands">
        <p>Register commands with <code>PUT /api/bot/v1/commands</code>. Members see them when they type “/” in a community where your bot is. When someone uses one, you get an <code>interaction</code> event with the user, channel, command and options. Reply in the HTTP response within 4 seconds to answer in the channel:</p>
        <Code>{`{ "content": "🎲 You rolled a 4" }`}</Code>
        <p>You can answer with <code>cards</code> too.</p>
        <p>Or answer later by posting a message through the API.</p>
      </Section>

      <Section n={11} title="Rules">
        <ul>
          <li>Follow the <Link href="/terms" className="font-medium text-accent-text underline">Terms of Service</Link>. No spam, no collecting people&apos;s data beyond what the bot needs, no pretending to be klique or its staff.</li>
          <li>You&apos;re responsible for what your bot does and what it keeps. Don&apos;t collect or sell what people write. We may switch off bots that break the rules.</li>
        </ul>
      </Section>
    </LegalDoc>
  );
}
