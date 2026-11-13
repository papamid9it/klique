import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalDoc, ReportEmail, Section } from "@/components/domain/legal/Legal";
import { MIN_SIGNUP_AGE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Child Safety Standards",
  description: "Klique's standards against child sexual abuse and exploitation, and how to report it.",
};

/** Public, no sign-in: Google Play asks social apps to publish their child safety (CSAE) standards. */
export default function ChildSafetyPage() {
  return (
    <LegalDoc
      title="Child Safety Standards"
      updated="13 November 2026"
      intro={
        <p>
          klique. has zero tolerance for child sexual abuse and exploitation (CSAE). This page explains our standards, how to report anything that puts a child at risk, and what we do
          when we receive a report. It applies to the klique. website, desktop app and phone apps, and sits alongside our{" "}
          <Link href="/terms" className="font-medium text-accent-text underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-accent-text underline">
            Privacy Policy
          </Link>
          .
        </p>
      }
    >
      <Section n={1} title="Adults only">
        <p>
          klique. is for people aged {MIN_SIGNUP_AGE} and over. Everyone gives their date of birth when they sign up, and we refuse sign-ups from anyone under {MIN_SIGNUP_AGE}. If we
          learn that an account belongs to someone under {MIN_SIGNUP_AGE}, we close it.
        </p>
      </Section>

      <Section n={2} title="What is never allowed">
        <ul>
          <li>Child sexual abuse material (CSAM) of any kind, including drawn, edited or AI-generated images, and links to it.</li>
          <li>Grooming: contacting, befriending or manipulating a child for sexual purposes, or trying to meet a child for that reason.</li>
          <li>Sexualising minors in any way, including comments, roleplay, sexual content about children, and sharing images of children in a sexual context.</li>
          <li>Sextortion, trafficking, or any content or behaviour that exploits or endangers a child.</li>
        </ul>
        <p>Breaking these rules means the content is removed and the account is banned for good, with no warning.</p>
      </Section>

      <Section n={3} title="How to report">
        <ul>
          <li>
            <strong>In the app or on the website:</strong> use <strong>Report</strong> on a post, comment, message, profile, event or community, and choose{" "}
            <strong>&ldquo;Involves a minor, or shared without consent&rdquo;</strong>. Reports with this reason are hidden from view at once and go to the top of our team&apos;s queue.
          </li>
          <li>
            <strong>By email:</strong> <ReportEmail /> {" "}
            (or <Contact />). Tell us where you saw it (a link, the community or the username), but please don&apos;t send us the image itself.
          </li>
          <li>
            If a child is in immediate danger, contact your local police first.
          </li>
        </ul>
      </Section>

      <Section n={4} title="What we do">
        <ul>
          <li>Our team reviews child safety reports as a priority.</li>
          <li>We remove the content and ban the accounts involved.</li>
          <li>We preserve the evidence securely, as the law requires, so it can be given to the authorities.</li>
          <li>
            We report child sexual abuse material and exploitation to the authorities: the NCMEC CyberTipline (National Center for Missing &amp; Exploited Children), and law enforcement in
            the country concerned, including the Nigeria Police Force and NAPTIP (National Agency for the Prohibition of Trafficking in Persons) in Nigeria.
          </li>
          <li>We cooperate with lawful requests from law enforcement.</li>
        </ul>
      </Section>

      <Section n={5} title="Keeping klique. safe">
        <ul>
          <li>Explicit content is off by default, opt-in for adults only, and never available in the phone apps.</li>
          <li>Communities for adult topics can only be private, and moderators and our team can remove content and members.</li>
          <li>Anyone can block another person, and every post, message, profile and community can be reported.</li>
        </ul>
      </Section>

      <Section n={6} title="Child safety contact">
        <p>
          Our child safety contact is <ReportEmail /> (or <Contact />). Law enforcement can use the same address.
        </p>
      </Section>
    </LegalDoc>
  );
}
