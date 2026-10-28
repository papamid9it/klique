import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalDoc, ReportEmail, Section } from "@/components/domain/legal/Legal";
import { REPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Terms of Service", description: "The rules for using klique." };

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="27 October 2026"
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
        <p>
          You can report anything that breaks these rules with the Report option{REPORT_EMAIL && <>, or by emailing <ReportEmail /></>}. We review reports and may remove content, cancel events, or suspend or close accounts that break these terms, with or without notice.
        </p>
      </Section>

      <Section n={4} title="Communities and their owners">
        <p>People who create communities and groups run them and set their own house rules on top of these terms. Owners and admins can remove members and content in their spaces. klique doesn&apos;t moderate every message, but we may step in at any time.</p>
      </Section>

      <Section n={5} title="18+ communities and explicit content" id="adult">
        <ul>
          <li>A private community can be marked <strong>18+</strong> for mature themes such as nightlife, alcohol or adult topics. Only people 18 or older (by the date of birth on their account) can find, see or join it, and its posts, events and members never show in feeds, search or Discover. No nudity, pornography or sexual services in an 18+ community unless it also allows explicit content.</li>
          <li>An 18+ community can also <strong>allow explicit content</strong>. Members must be 18 or older and switch on Show explicit content in Settings, agreeing to see it. Explicit posts are blurred until tapped. These communities can&apos;t take donations, contributions or payouts, and never carry ads.</li>
          <li>Explicit content is allowed <strong>only</strong> in communities marked to allow it. Owners and admins must moderate their community and remove anything that breaks these terms.</li>
          <li><strong>Zero tolerance</strong>, anywhere on klique: anything involving a minor; intimate images shared without the consent of everyone in them; non-consensual content; offering or asking for sexual services; and illegal content. We remove it immediately, close the accounts involved and, where the law requires, report it to the authorities.</li>
          <li>
            Report anything like this with Report → &ldquo;Involves a minor, or shared without consent&rdquo;: it&apos;s hidden at once while we review it.{REPORT_EMAIL && <> For anything urgent, email <ReportEmail /> too.</>}
          </li>
          <li>Your date of birth can be set once. Giving a false date of birth to get into an 18+ community breaks these terms.</li>
        </ul>
      </Section>

      <Section n={6} title="Events">
        <ul>
          <li>Hosts are responsible for their events: accurate details, safety, permits, refunds and anything sold. klique isn&apos;t the organiser and isn&apos;t a party to any deal between hosts and attendees.</li>
          <li>Some public events are listed from other websites and credited to their organiser with a link to the original. Check details with the organiser before you go or pay.</li>
          <li>Go to events with care. Meet in public places and tell someone where you&apos;re going.</li>
          <li>Some events and cards are paid placements, labelled &ldquo;Promoted&rdquo; or &ldquo;Sponsored&rdquo;. Advertisers are responsible for their offers; a placement isn&apos;t an endorsement by klique.</li>
        </ul>
      </Section>

      <Section n={7} title="Our service">
        <p>We work to keep klique running and safe, but it&apos;s provided &ldquo;as is&rdquo;. We may change, pause or stop features. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, for content posted by others, or for what happens at events, and our total liability to you is limited to ₦50,000. Nothing in these terms limits rights you have under Nigerian consumer protection law that can&apos;t be limited.</p>
      </Section>

      <Section n={8} title="Ending your account">
        <p>You can delete your account at any time in Settings → My Account. We may suspend or close accounts that break these terms or the law.</p>
      </Section>

      <Section n={9} title="Changes and law">
        <p>We may update these terms. If a change is significant, we&apos;ll tell you in the app or by email before it takes effect. These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State have jurisdiction.</p>
      </Section>

      <Section n={10} title="Contact">
        <p>
          Questions about these terms? <Contact />.
        </p>
        {REPORT_EMAIL && (
          <p>
            Abuse, safety concerns and requests from law enforcement: <ReportEmail />.
          </p>
        )}
      </Section>
    </LegalDoc>
  );
}
