import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Contact, LegalDoc, Section } from "@/components/domain/legal/Legal";
import { DEFAULT_MONEY_CONFIG } from "@/lib/money";
import { publicFees } from "@/server/services/share.service";

export const metadata: Metadata = { title: "Payment terms", description: "How Lite and Pro plans, donations, event contributions, refunds, fees and payouts work on klique." };

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
      updated="3 November 2026"
      intro={
        <p>
          These terms cover money on klique: the Lite and Pro plans, donations to communities and contributions toward events. They add to our <Link href="/terms" className="font-medium text-accent-text underline">Terms of Service</Link>. Payments are handled by Paystack; klique never sees or keeps your card details.
        </p>
      }
    >
      <Section n={1} title="Lite and Pro plans" id="plans">
        <ul>
          <li>klique is free to use. <strong>Lite</strong> and <strong>Pro</strong> are optional monthly plans with higher limits. What each plan includes and its price in naira are shown on the <Link href="/pricing" className="font-medium text-accent-text underline">Pricing</Link> page and before you pay.</li>
          <li>
            <strong>Your plan renews monthly until you cancel.</strong> When you subscribe, Paystack saves your card and charges the same amount again every month. Each payment gives you another month (30 days).
          </li>
          <li>
            <strong>Cancelling:</strong> go to Settings → Plan &amp; points → Cancel subscription at any time. Nothing more is charged. You keep the plan until the end of the month you&apos;ve paid for, then you move to Free. Turning off the subscription from a Paystack email does the same.
          </li>
          <li>
            <strong>No refunds for part of a month.</strong> If you cancel or switch plans, we don&apos;t refund the days left. If you were charged by mistake or twice, contact us (see section 7) and we&apos;ll put it right.
          </li>
          <li>
            <strong>Switching plans:</strong> moving to another plan starts a new month on that plan from the day you pay, and your old plan stops renewing. Days left on the old plan aren&apos;t carried over.
          </li>
          <li>
            <strong>If a renewal fails</strong> (for example an expired card), we&apos;ll let you know and Paystack will try again. If no payment goes through, your plan ends a day after the month you paid for, and you move to Free.
          </li>
          <li>
            <strong>Price changes:</strong> if we change a plan&apos;s price, the new price is for new subscriptions. Your subscription keeps renewing at the price you signed up at. A new price applies to you only if you subscribe again, and you&apos;ll see it before you pay.
          </li>
          <li>
            <strong>Limits can change.</strong> We set each plan&apos;s limits (for example how many kliques you can start or be in, how many communities you can create or join, and profile photo and video slots), and we may change them. The current limits are always on the Pricing page.
          </li>
          <li>
            <strong>Going back to Free takes nothing away.</strong> Communities, groups and kliques you already have keep working for everyone in them. You just can&apos;t create or join more until you&apos;re back under Free&apos;s limits. Your gallery photos and videos all stay on your profile, but you can&apos;t add or replace any until you&apos;re within your plan&apos;s slots (you can still remove or reorder them).
          </li>
          <li>Free time, such as days given by klique, doesn&apos;t renew and ends on the date shown in Settings.</li>
        </ul>
      </Section>

      <Section n={2} title="Hype and awards" id="gifts">
        <ul>
          <li>
            Hype is used only to send awards to posts, comments, board posts and messages in community chats (not private messages, group messages or klique chats). <strong>1 Hype is ₦10.</strong> You can buy it on the website (paid with Paystack) or in the phone app (paid with Apple or Google, where packs cost more because the stores take a share).
          </li>
          <li>
            <strong>Hype can&apos;t be refunded, cashed out, or moved to another account.</strong> It isn&apos;t money for the person who buys it, and an award can&apos;t be taken back once it&apos;s sent. Check the award before you send it.
          </li>
          <li>You can send an award anonymously: the person and everyone else see &quot;Someone&quot;. klique still records who sent it, and only klique&apos;s staff can see that, to deal with fraud, abuse or payment problems.</li>
          <li>
            <strong>Who earns from awards.</strong> You earn from the awards you receive only once you qualify: at least 1,000 points, at least 3 months on klique, and an account in Nigeria (earning is only open in Nigeria for now). klique may change these rules, with notice here; changes apply to awards sent after them.
          </li>
          <li>
            An award sent to someone who doesn&apos;t qualify yet still shows on their post, comment or message, but its whole value goes to klique. It isn&apos;t credited to them later, when they do qualify: only awards received after qualifying earn.
          </li>
          <li>
            Once you qualify, you earn 70% of each award&apos;s naira value; klique keeps 30%. Earnings are held for 7 days, then can be paid to a Nigerian bank account once they reach ₦20,000. Payouts requested by the end of a month are paid on the 3rd of the next month, under the payout rules below. klique may change these figures for awards sent after a change, with notice here.
          </li>
          <li>klique may hold back or reverse earnings from awards paid for with a refunded, disputed or fraudulent purchase, and may close Hype accounts used for fraud or to move money.</li>
          <li>Hype from before November 2026 (used for profile designs) was turned into days of Lite at the time and is separate from Hype for awards.</li>
        </ul>
      </Section>

      <Section n={3} title="Donations">
        <ul>
          <li>A donation goes to the community whose button you used. It&apos;s a gift: you get nothing in return, and it isn&apos;t a purchase.</li>
          <li>
            <strong>Donations can&apos;t be refunded.</strong> Please check the amount before you pay.
          </li>
          <li>A goal on a donation button shows what the community hopes to raise. Reaching it isn&apos;t promised, and the money is the community&apos;s either way.</li>
        </ul>
      </Section>

      <Section n={4} title="Event contributions">
        <ul>
          <li>Some events let you chip in toward them (for example equipment or food), at a set price per unit. The money goes to the community the event is in.</li>
          <li>The event&apos;s host or the community&apos;s owner or admins can refund a contribution until the community has asked for the money to be paid out. A refund is what you paid minus klique&apos;s fee, back to your card.</li>
          <li>Once the money has been asked for, it shows as &ldquo;Withdrawn&rdquo; and can&apos;t be refunded through klique. Speak to the host or the community.</li>
        </ul>
      </Section>

      <Section n={5} title="Klique's fee">
        <p>
          Klique keeps <strong>{f.donationFeePercent}%</strong> of each donation and <strong>{f.contributionFeePercent}%</strong> of each contribution to run payments and the service. The fee is fixed when you pay, and isn&apos;t returned on a refund.
        </p>
      </Section>

      <Section n={6} title="Payouts to communities">
        <ul>
          <li>What a community raises, after klique&apos;s fee, is paid to its owner&apos;s Nigerian bank account when the owner asks (at least {naira(f.minPayout)}).</li>
          <li>We check the account name with the bank, and may hold or refuse a payout we believe is fraudulent, or that breaks our Terms of Service or the law.</li>
          <li>Community owners are responsible for using the money as they said they would, and for any taxes on it.</li>
        </ul>
      </Section>

      <Section n={7} title="Problems">
        <p>If a payment went wrong (charged twice, or charged and nothing showed), contact us with the payment reference from your receipt notification and we&apos;ll sort it out with Paystack.</p>
        <Contact />
      </Section>
    </LegalDoc>
  );
}
