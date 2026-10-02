import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Toss: the website, the baskets, the bots and the laundry platform.",
};

const EMAIL = "toss.smartlaundry@gmail.com";

export default function TermsPage() {
  return (
    <InfoPage kicker="Terms of Service" title="The rules, kept short." updated="3 October 2026">
      <p>
        These terms cover the Toss website, the Toss baskets, our Telegram bots and the platform laundries use (together, &ldquo;Toss&rdquo;).
        By using Toss you agree to them. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your data.
      </p>

      <h2>Who does what</h2>
      <p>
        Toss is software and hardware that connects you with a laundry. <b>The laundry you choose does the washing</b>, sets its prices,
        employs its drivers and is responsible for your clothes while it has them. Questions about a wash, a damaged item or a refund go to
        that laundry first; we&apos;ll help where we can.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details, especially your pickup address and contact number.</li>
        <li>Keep your password to yourself. You&apos;re responsible for what happens under your account.</li>
        <li>Tell us straight away at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> if you think someone else has got in.</li>
      </ul>

      <h2>Pickups, weight and price</h2>
      <ul>
        <li>A pickup is booked when your basket reaches its target weight or when you ask for one.</li>
        <li>
          Your price is the laundry&apos;s rate per kg times the weight. The basket&apos;s reading is an estimate; the weight confirmed by the
          driver or laundry at pickup is the one that counts, and you&apos;ll see both.
        </li>
        <li>Keep the basket zeroed (tare it when empty) so its readings stay accurate.</li>
      </ul>

      <h2>Payments</h2>
      <p>
        You pay the laundry directly, by UPI or cash. Toss records the payment but doesn&apos;t hold your money or see your bank details.
        Disputes about a charge are between you and the laundry; send us the order number if you need help.
      </p>

      <h2>For laundries</h2>
      <ul>
        <li>Set honest prices and a service area you can actually cover.</li>
        <li>Use customer details only to serve those customers, and keep them private.</li>
        <li>You&apos;re responsible for your drivers, the clothes in your care, and the taxes and records your business must keep.</li>
      </ul>

      <h2>The basket</h2>
      <p>
        Baskets are printed to order. Price, colour and delivery are confirmed with you before you pay. Power it from a normal USB-C charger,
        keep it dry and don&apos;t stand on it. If it arrives faulty, tell us within 7 days and we&apos;ll fix or replace it.
      </p>

      <h2>Fair use</h2>
      <p>
        Don&apos;t try to break into Toss, read other people&apos;s data, flood our forms or bots, or use Toss for anything illegal. We may
        suspend accounts that do.
      </p>

      <h2>Availability and liability</h2>
      <p>
        We work hard to keep Toss running, but it&apos;s provided as it is, and it may sometimes be down or make mistakes (a missed reading,
        a late message). As far as the law allows, we aren&apos;t liable for indirect losses, and our total liability to you is limited to what
        you paid Toss in the past 12 months. Nothing here limits rights you have under Indian consumer law.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using Toss at any time and ask us to close your account. We may close accounts that break these terms, and will tell you
        why.
      </p>

      <h2>Changes and law</h2>
      <p>
        If we change these terms we&apos;ll update the date at the top and tell signed-in users about anything important. These terms are
        governed by the laws of India, and the courts of New Delhi have jurisdiction.
      </p>

      <p className="pt-2">
        Questions? <Link href="/contact">Contact us</Link>.
      </p>
    </InfoPage>
  );
}
