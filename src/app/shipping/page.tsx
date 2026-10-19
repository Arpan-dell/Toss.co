import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  alternates: { canonical: "/shipping" },
  title: "Shipping & Exchange Policy",
  description: "How Toss baskets are delivered, how laundry pickups and deliveries work, exchanges, and how Toss plans are delivered online.",
};

export default function ShippingPage() {
  const email = BUSINESS.email;
  return (
    <InfoPage kicker="Shipping & Exchange Policy" title="How things reach you." updated="20 October 2026">
      <p>
        Toss is mostly a service: your laundry collects and returns your clothes, and laundries use Toss online. The only thing we ship is the
        Toss basket. This page explains how each one reaches you and how exchanges work. Refunds are covered in our{" "}
        <Link href="/refund">Cancellation &amp; Refund Policy</Link>.
      </p>

      <h2>Laundry pickups and deliveries</h2>
      <ul>
        <li>A driver from your laundry collects your clothes from your door when your basket books a pickup or when you ask for one.</li>
        <li>
          Clean clothes come back to your address by the laundry&apos;s own driver within the turnaround the laundry promises (shown in the
          app), or you collect them from the store if your laundry doesn&apos;t deliver. Any delivery charge is shown before you pay.
        </li>
        <li>Deliveries are handed over with a 4-digit code sent to you, so your clothes only go to you.</li>
      </ul>

      <h2>The Toss basket</h2>
      <ul>
        <li>
          Each basket is printed to order. The price, colour, delivery date and any delivery charge are confirmed with you before you pay.
        </li>
        <li>We deliver it to your address in the areas where Toss laundries work, and keep you updated by message or email if anything changes.</li>
        <li>If it doesn&apos;t arrive by the date we confirmed, you can cancel for a full refund.</li>
      </ul>

      <h2>Exchanges</h2>
      <ul>
        <li>
          A basket that arrives faulty, or stops working because of a fault within <b>7 days</b>, is repaired or exchanged for a new one at
          no cost. If we can&apos;t, we refund the full price.
        </li>
        <li>Because each basket is made in the colour you pick, we can&apos;t exchange it for another colour once it&apos;s printed.</li>
        <li>
          Damaged or missing clothes are handled by your laundry: tell them, or us, within <b>48 hours</b> of getting your clothes back,
          with your order number.
        </li>
      </ul>

      <h2>Toss plans for laundries</h2>
      <p>
        Toss Pro is software, delivered online: nothing is shipped. Your plan switches on as soon as the payment is confirmed, and you get a
        receipt by email.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${email}?subject=Delivery%20question`}>{email}</a> or see <Link href="/contact">Contact</Link>. We reply within
        2 working days.
      </p>
    </InfoPage>
  );
}
