import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalDoc, Section } from "@/components/domain/legal/Legal";

export const metadata: Metadata = { title: "Terms of Service", description: "The rules for using klique." };

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="19 October 2026"
      intro={
        <p>
          These terms are the agreement between you and klique. (&ldquo;klique&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) for using our website and apps. By creating an account or using klique you agree to them. If you don&apos;t agree, please don&apos;t use
          klique. How we handle your personal data is explained in our <Link href="/privacy" className="font-medium text-accent-text underline">Privacy Policy</Link>.
        </p>
      }
    >
      <Section n={1} title="Who can use klique">
        <ul>
          <li>You must be at least 13 years old. If you&apos;re under 18, you confirm a parent or guardian has agreed to these terms.</li>
          <li>You must give accurate sign-up details and keep your password secret. You&apos;re responsible for what happens on your account.</li>
          <li>One person, one account. Don&apos;t impersonate anyone or create accounts to get around a suspension.</li>
        </ul>
      </Section>

      <Section n={2} title="What you post">
        <p>You keep ownership of what you post (messages, photos, events, community details). You give us a worldwide, non-exclusive, royalty-free licence to host, store, show and share it on klique so the service works, for example showing your event to people nearby. The licence ends when you delete the content or your account, except where others have already shared it or we must keep it by law.</p>
        <p>You&apos;re responsible for what you post and confirm you have the right to post it.</p>
      </Section>

      <Section n={3} title="Community rules">
        <p>Don&apos;t use klique to:</p>
        <ul>
          <li>harass, bully, threaten or dox anyone, or post hate speech;</li>
          <li>post sexual content involving minors, non-consensual intimate images, or graphic violence;</li>
          <li>scam people, sell fake tickets, spam, or ask for passwords, PINs or bank details;</li>
          <li>promote illegal activity, or post content that infringes someone else&apos;s copyright or trademark;</li>
          <li>attack, overload, scrape or reverse-engineer the service, or access accounts that aren&apos;t yours.</li>
        </ul>
        <p>You can report anything that breaks these rules with the Report option. We review reports and may remove content, cancel events, or suspend or close accounts that break these terms, with or without notice.</p>
      </Section>

      <Section n={4} title="Communities and their owners">
        <p>People who create communities and groups run them and set their own house rules on top of these terms. Owners and admins can remove members and content in their spaces. klique doesn&apos;t moderate every message, but we may step in at any time.</p>
      </Section>

      <Section n={5} title="Events">
        <ul>
          <li>Hosts are responsible for their events: accurate details, safety, permits, refunds and anything sold. klique isn&apos;t the organiser and isn&apos;t a party to any deal between hosts and attendees.</li>
          <li>Some public events are listed from other websites and credited to their organiser with a link to the original. Check details with the organiser before you go or pay.</li>
          <li>Go to events with care. Meet in public places and tell someone where you&apos;re going.</li>
        </ul>
      </Section>

      <Section n={6} title="Our service">
        <p>We work to keep klique running and safe, but it&apos;s provided &ldquo;as is&rdquo;. We may change, pause or stop features. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, for content posted by others, or for what happens at events, and our total liability to you is limited to ₦50,000. Nothing in these terms limits rights you have under Nigerian consumer protection law that can&apos;t be limited.</p>
      </Section>

      <Section n={7} title="Ending your account">
        <p>You can delete your account at any time in Settings → My Account. We may suspend or close accounts that break these terms or the law.</p>
      </Section>

      <Section n={8} title="Changes and law">
        <p>We may update these terms. If a change is significant, we&apos;ll tell you in the app or by email before it takes effect. These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State have jurisdiction.</p>
      </Section>

      <Section n={9} title="Contact">
        <p>
          Questions about these terms? <Contact />.
        </p>
      </Section>
    </LegalDoc>
  );
}
