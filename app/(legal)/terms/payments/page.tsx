import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Contact, LegalDoc, Section } from "@/components/domain/legal/Legal";
import { DEFAULT_MONEY_CONFIG } from "@/lib/money";
import { publicFees } from "@/server/services/share.service";

export const metadata: Metadata = { title: "Payment terms", description: "How donations, event contributions, refunds, fees and payouts work on klique." };

async function fees() {
  "use cache";
  cacheLife("minutes");
  return publicFees().catch(() => DEFAULT_MONEY_CONFIG);
}

export default async function PaymentTermsPage() {
  const f = await fees();
  const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
  return (
    <LegalDoc
      title="Payment terms"
      updated="27 October 2026"
      intro={
        <p>
          These terms cover money on klique: donations to communities and contributions toward events. They add to our <Link href="/terms" className="font-medium text-accent-text underline">Terms of Service</Link>. Payments are handled by Paystack; klique never sees or keeps your card details.
        </p>
      }
    >
      <Section n={1} title="Donations">
        <ul>
          <li>A donation goes to the community whose button you used. It&apos;s a gift: you get nothing in return, and it isn&apos;t a purchase.</li>
          <li>
            <strong>Donations can&apos;t be refunded.</strong> Please check the amount before you pay.
          </li>
          <li>A goal on a donation button shows what the community hopes to raise. Reaching it isn&apos;t promised, and the money is the community&apos;s either way.</li>
        </ul>
      </Section>

      <Section n={2} title="Event contributions">
        <ul>
          <li>Some events let you chip in toward them (for example equipment or food), at a set price per unit. The money goes to the community the event is in.</li>
          <li>The event&apos;s host or the community&apos;s owner or admins can refund a contribution until the community has asked for the money to be paid out. A refund is what you paid minus klique&apos;s fee, back to your card.</li>
          <li>Once the money has been asked for, it shows as &ldquo;Withdrawn&rdquo; and can&apos;t be refunded through klique. Speak to the host or the community.</li>
        </ul>
      </Section>

      <Section n={3} title="Klique's fee">
        <p>
          Klique keeps <strong>{f.donationFeePercent}%</strong> of each donation and <strong>{f.contributionFeePercent}%</strong> of each contribution to run payments and the service. The fee is fixed when you pay, and isn&apos;t returned on a refund.
        </p>
      </Section>

      <Section n={4} title="Payouts to communities">
        <ul>
          <li>What a community raises, after klique&apos;s fee, is paid to its owner&apos;s Nigerian bank account when the owner asks (at least {naira(f.minPayout)}).</li>
          <li>We check the account name with the bank, and may hold or refuse a payout we believe is fraudulent, or that breaks our Terms of Service or the law.</li>
          <li>Community owners are responsible for using the money as they said they would, and for any taxes on it.</li>
        </ul>
      </Section>

      <Section n={5} title="Problems">
        <p>If a payment went wrong (charged twice, or charged and nothing showed), contact us with the payment reference from your receipt notification and we&apos;ll sort it out with Paystack.</p>
        <Contact />
      </Section>
    </LegalDoc>
  );
}
