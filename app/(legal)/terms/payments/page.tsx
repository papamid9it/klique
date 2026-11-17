import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalDoc, Section } from "@/components/domain/legal/Legal";

export const metadata: Metadata = { title: "Payment terms", description: "How Lite and Pro plans, Hype and awards, and refunds work on klique." };

/*
 * Nov 2026: klique sells only its own things (Lite and Pro, Hype, ads). Donations, event contributions and payouts to
 * communities are off, and so is earning from awards (Admin → System). The earlier wording for those is in git history,
 * for when they come back.
 */
export default function PaymentTermsPage() {
  return (
    <LegalDoc
      title="Payment terms"
      updated="17 November 2026"
      intro={
        <p>
          These terms cover what you can buy on klique: the Lite and Pro plans and Hype. They add to our <Link href="/terms" className="font-medium text-accent-text underline">Terms of Service</Link>. In the phone app, payments are handled by Apple or Google; on the website, when card payments are available there, by Paystack, Flutterwave or OPay (you choose which at checkout when there&apos;s more than one). klique never sees or keeps your card details.
        </p>
      }
    >
      <Section n={1} title="Lite and Pro plans" id="plans">
        <ul>
          <li>klique is free to use. <strong>Lite</strong> and <strong>Pro</strong> are optional monthly plans with higher limits. What each plan includes and its price are shown on the <Link href="/pricing" className="font-medium text-accent-text underline">Pricing</Link> page and before you pay.</li>
          <li>
            <strong>In the phone app</strong>, a plan is bought 30 days at a time through Apple or Google and doesn&apos;t renew by itself. Buying the same plan again adds 30 days to the time you have left. Refunds for these purchases are handled by Apple or Google under their own rules.
          </li>
          <li>
            <strong>On the website</strong> (when card payments are available there): <strong>your plan renews monthly until you cancel.</strong> When you subscribe, Paystack saves your card and charges the same amount again every month. Each payment gives you another month (30 days). <strong>Paid with Flutterwave or OPay</strong>, a plan lasts 30 days and doesn&apos;t renew by itself; buying it again adds another 30 days, and a Paystack plan that was renewing is stopped so you aren&apos;t charged twice.
          </li>
          <li>
            <strong>Cancelling a website plan:</strong> go to Settings → Plan &amp; points → Cancel subscription at any time. Nothing more is charged. You keep the plan until the end of the month you&apos;ve paid for, then you move to Free. Turning off the subscription from a Paystack email does the same.
          </li>
          <li>
            <strong>No refunds for part of a month.</strong> If you cancel or switch plans, we don&apos;t refund the days left. If you were charged by mistake or twice, contact us (see section 4) and we&apos;ll put it right.
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
            Hype is used only to send awards to posts, comments, board posts and messages in community chats (not private messages, group messages or klique chats). <strong>1 Hype is ₦10.</strong> You buy it in the phone app (paid with Apple or Google, where packs cost more because the stores take a share), or on the website when card payments are available there.
          </li>
          <li>
            <strong>Hype can&apos;t be refunded, cashed out, or moved to another account.</strong> It isn&apos;t money for the person who buys it, and an award can&apos;t be taken back once it&apos;s sent. Check the award before you send it.
          </li>
          <li>You can send an award anonymously: the person and everyone else see &quot;Someone&quot;. klique still records who sent it, and only klique&apos;s staff can see that, to deal with fraud, abuse or payment problems.</li>
          <li>
            <strong>Earning from awards is paused for now.</strong> Awards still show on posts, comments and messages, but their whole value goes to klique, and nobody earns from awards received while earning is paused. Earnings from before the pause are kept. If earning comes back, the rules below apply, and only to awards sent after it&apos;s back.
          </li>
          <li>
            <strong>Who earns from awards</strong> (when earning is on). You earn from the awards you receive only once you qualify: at least 1,000 points, at least 3 months on klique, and an account in Nigeria (earning is only open in Nigeria for now). klique may change these rules, with notice here; changes apply to awards sent after them.
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

      <Section n={3} title="Donations, contributions and payouts">
        <p>
          klique doesn&apos;t currently take donations to communities or contributions toward events, and doesn&apos;t pay money out to communities. klique doesn&apos;t sell event tickets either: when an event costs money, you pay its organiser on their own site. If we bring donations or contributions back, we&apos;ll update these terms first.
        </p>
      </Section>

      <Section n={4} title="Problems">
        <p>If a payment went wrong (charged twice, or charged and nothing showed), contact us with the receipt or order number and we&apos;ll put it right. For a purchase in the phone app, you can also ask Apple or Google for a refund under their rules.</p>
        <Contact />
      </Section>
    </LegalDoc>
  );
}
