import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalDoc, Section } from "@/components/domain/legal/Legal";

export const metadata: Metadata = { title: "Privacy Policy", description: "What klique collects, why, and your rights." };

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="19 October 2026"
      intro={
        <p>
          This policy explains what personal data klique. collects, why, who we share it with, and the rights you have under the Nigeria Data Protection Act 2023 (NDPA) and, where it applies, the GDPR. klique is the data controller. It goes with our{" "}
          <Link href="/terms" className="font-medium text-accent-text underline">
            Terms of Service
          </Link>
          .
        </p>
      }
    >
      <Section n={1} title="What we collect">
        <ul>
          <li><strong>Account details:</strong> email, password (stored only as a secure hash), display name, username, and, if you use Google sign-in, your Google account ID, name and picture.</li>
          <li><strong>Profile:</strong> bio, interests, country, state, city and neighbourhood, profile pictures and style choices.</li>
          <li><strong>What you do and post:</strong> communities and groups you join, messages, posts, reactions, events you host, RSVP to or save, friends, blocks and reports.</li>
          <li><strong>Devices:</strong> if you turn on notifications, a notification address for your phone or browser.</li>
          <li><strong>Technical data:</strong> IP address (used for security and rate limits) and a single sign-in cookie. We don&apos;t use advertising or tracking cookies.</li>
        </ul>
      </Section>

      <Section n={2} title="Why we use it">
        <ul>
          <li><strong>To run klique for you</strong> (performing our contract with you): your account, communities, chats, events and notifications.</li>
          <li><strong>To keep people safe</strong> (legitimate interests and legal obligations): preventing spam and abuse, reviewing reports, and enforcing our rules.</li>
          <li><strong>To show you what&apos;s near you</strong> (legitimate interests): we use the city you choose. We don&apos;t track your precise location.</li>
          <li><strong>To send emails you need</strong>: verification, password resets and important account notices. We don&apos;t send marketing without your consent.</li>
          <li><strong>To show ads</strong> (legitimate interests): some cards are ads, always labelled &ldquo;Sponsored&rdquo; or &ldquo;Promoted&rdquo;. They&apos;re chosen only by the place and scene you&apos;re looking at, the words you search and the interests on your profile. Advertisers never receive your personal data. We only count how many times an ad was shown and clicked, without recording who.</li>
        </ul>
        <p>We don&apos;t sell your personal data, we don&apos;t use advertising or tracking cookies, and ads never appear in chats or direct messages. You can report any ad you think breaks our rules.</p>
      </Section>

      <Section n={3} title="Who sees what">
        <p>Your profile is visible according to your privacy setting (everyone, people you share a community with, or only you). Content you post in a community is visible to the people who can see that community. Direct messages are visible to the people in the conversation, and to our moderators if a message is reported.</p>
      </Section>

      <Section n={4} title="Who we share it with">
        <p>We use trusted service providers who process data for us under contract:</p>
        <ul>
          <li>MongoDB Atlas (database) and Vercel (hosting);</li>
          <li>Cloudinary (pictures you upload);</li>
          <li>Ably and LiveKit (live chat and voice channels);</li>
          <li>Expo and browser push services (notifications);</li>
          <li>our email provider (account emails) and Google (if you use Google sign-in).</li>
        </ul>
        <p>Some of these providers store data outside Nigeria, for example in the EU or the United States. Where that happens we rely on the safeguards the NDPA allows, such as contractual protections. We may also disclose data when the law requires it, or to protect people from harm.</p>
      </Section>

      <Section n={5} title="How long we keep it">
        <p>We keep your data while your account is open. When you delete your account we delete your profile, memberships, RSVPs, saved events, friends, devices and the events you host straight away. Messages and posts you wrote in shared conversations stay so those conversations still make sense, shown as &ldquo;Deleted user&rdquo;. Backups are overwritten within 30 days. We keep reports and moderation records for as long as needed to keep klique safe.</p>
      </Section>

      <Section n={6} title="Your rights">
        <p>You can ask to access, correct, move (portability) or delete your data, object to or restrict how we use it, and withdraw consent at any time. You can edit most things yourself in Settings, and delete your account in Settings → My Account. For anything else, <Contact />. We&apos;ll reply within 30 days. If you&apos;re unhappy with our answer, you can complain to the Nigeria Data Protection Commission (ndpc.gov.ng).</p>
      </Section>

      <Section n={7} title="Children">
        <p>klique is for people aged 13 and over. If you believe a child under 13 has an account, tell us and we&apos;ll delete it.</p>
      </Section>

      <Section n={8} title="Security">
        <p>We use encryption in transit (HTTPS), hashed passwords, signed sessions, and access controls on our systems. No service is perfectly secure. If a breach affects you, we&apos;ll tell you and the regulator as the law requires.</p>
      </Section>

      <Section n={9} title="Changes">
        <p>We may update this policy. If a change is significant, we&apos;ll tell you in the app or by email first.</p>
      </Section>
    </LegalDoc>
  );
}
