import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/domain/legal/Legal";
import { appUrl } from "@/server/env";

export const metadata: Metadata = { title: "Build a bot", description: "How to build bots and slash commands for klique communities." };

const Code = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded-control border border-line bg-raised p-3 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>;

export default function DevelopersPage() {
  const site = appUrl();
  return (
    <LegalDoc
      title="Build a bot"
      updated="3 November 2026"
      intro={
        <p>
          Bots welcome people, moderate, run games and polls, post alerts and answer slash commands in klique communities. Anyone on Pro can make one in{" "}
          <Link href="/settings#developers" className="font-medium text-accent-text underline">
            Settings → Developers
          </Link>
          . Community owners add it with its invite link and choose what it may do.
        </p>
      }
    >
      <Section n={1} title="How it fits together">
        <ul>
          <li>Your bot has its own account (shown with a BOT tag). When an owner adds it, it joins the community with its own role holding the permissions they gave it. It can only act on people below that role.</li>
          <li>klique sends <strong>events</strong> (things that happened) to your bot&apos;s endpoint. Your bot does things by calling the <strong>bot API</strong> with its token.</li>
          <li>Bots work in community channels and threads. Never in DMs, and never in 18+ communities. A community&apos;s bots and webhooks share one limit (2 on Free, 5 on Lite, 10 on Pro, by its owner&apos;s plan).</li>
        </ul>
      </Section>

      <Section n={2} title="Calling the bot API">
        <p>Send your token in every request. Keep it secret; if it leaks, make a new one in Developers.</p>
        <Code>{`curl -X POST ${site}/api/bot/v1/channels/CHANNEL_ID/messages \\
  -H "Authorization: Bot YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from my bot 👋"}'`}</Code>
        <ul>
          <li><code>GET /api/bot/v1/me</code>: your bot, its commands and the communities it&apos;s in.</li>
          <li><code>GET /api/bot/v1/communities/:communityId/channels</code>: channels it can see.</li>
          <li><code>POST /api/bot/v1/channels/:channelId/messages</code> <code>{`{ content, reply_to? }`}</code>: post (up to 2,000 characters).</li>
          <li><code>PATCH</code> / <code>DELETE /api/bot/v1/channels/:channelId/messages/:messageId</code>: edit its own message; delete its own, or anyone&apos;s below it with “Delete messages”.</li>
          <li><code>PUT /api/bot/v1/channels/:channelId/messages/:messageId/reactions/:kind</code>: react (again to take it back).</li>
          <li><code>POST /api/bot/v1/communities/:communityId/members/:userId/timeout</code> <code>{`{ seconds, reason }`}</code>: 60, 300, 600, 3600, 86400 or 604800 seconds; 0 lifts it. Needs “Time out members”.</li>
          <li><code>DELETE /api/bot/v1/communities/:communityId/members/:userId</code> (add <code>?ban=1</code> to ban): needs “Remove members” or “Ban members”.</li>
          <li><code>PUT /api/bot/v1/communities/:communityId/members/:userId/roles</code> <code>{`{ roleIds }`}</code>: needs “Manage roles”; only roles below the bot&apos;s.</li>
          <li><code>PUT /api/bot/v1/commands</code> <code>{`{ commands: [{ name, description, options: [{ name, description, required }] }] }`}</code>: register up to 25 slash commands.</li>
        </ul>
        <p>Answers are JSON: <code>{`{ "success": true, "data": … }`}</code> or <code>{`{ "success": false, "message": "…" }`}</code>. Limit: 120 calls a minute. Everything your bot does goes through the same rules as people: permissions, rank, timeouts, AutoMod and the moderation log.</p>
      </Section>

      <Section n={3} title="Events">
        <p>Set an https endpoint in Developers and klique POSTs JSON there:</p>
        <Code>{`{ "type": "message.create", "data": { "community": {…}, "channel": {…}, "message": {…} }, "sentAt": "…" }`}</Code>
        <ul>
          <li><code>message.create</code>, <code>reaction</code>, <code>member.join</code>, <code>member.leave</code>, <code>klique.create</code>, <code>event.create</code>, <code>bot.added</code>, and <code>interaction</code> (a slash command).</li>
          <li>Answer within 4 seconds with a 2xx. After 50 failures in a row events stop until you save the endpoint again.</li>
          <li>
            Check every event is really from klique: <code>X-Klique-Signature</code> is <code>sha256=</code> + the hex HMAC-SHA256 of <code>{"`${X-Klique-Timestamp}.${body}`"}</code> with your signing secret. Reject old timestamps.
          </li>
        </ul>
        <Code>{`import { createHmac, timingSafeEqual } from "node:crypto";
const sig = createHmac("sha256", SECRET).update(\`\${req.headers["x-klique-timestamp"]}.\${rawBody}\`).digest("hex");
const ok = timingSafeEqual(Buffer.from(\`sha256=\${sig}\`), Buffer.from(req.headers["x-klique-signature"]));`}</Code>
      </Section>

      <Section n={4} title="Slash commands">
        <p>Register commands with <code>PUT /api/bot/v1/commands</code>. Members see them when they type “/” in a community where your bot is. When someone uses one, you get an <code>interaction</code> event with the user, channel, command and options. Reply in the HTTP response within 4 seconds to answer in the channel:</p>
        <Code>{`{ "content": "🎲 You rolled a 4" }`}</Code>
        <p>Or answer later by posting a message through the API.</p>
      </Section>

      <Section n={5} title="Rules">
        <ul>
          <li>Follow the <Link href="/terms" className="font-medium text-accent-text underline">Terms of Service</Link>. No spam, no collecting people&apos;s data beyond what the bot needs, no pretending to be klique or its staff.</li>
          <li>You&apos;re responsible for what your bot does. We may switch off bots that break the rules.</li>
        </ul>
      </Section>
    </LegalDoc>
  );
}
