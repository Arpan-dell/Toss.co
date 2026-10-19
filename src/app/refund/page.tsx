import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";
import { BUSINESS } from "@/lib/business";
import { getPublicPlan } from "@/lib/data";

export const metadata: Metadata = {
  alternates: { canonical: "/refund" },
  title: "Cancellation & Refund Policy",
  description: "Refunds and cancellations for Toss baskets, laundry pickups, basket credit and laundry subscriptions.",
};

// Prices and credit rules come from the owner's settings, so this page always matches the offer.
export const revalidate = 300;

export default async function RefundPage() {
  const plan = await getPublicPlan();
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const email = BUSINESS.email;
  return (
    <InfoPage kicker="Cancellation & Refund Policy" title="Refunds, kept simple." updated="20 October 2026">
      <p>
        This page explains when you get money back for things bought through Toss. It sits alongside our <Link href="/terms">Terms</Link>.
        Nothing here limits your rights under Indian consumer law.
      </p>

      <h2>Laundry pickups</h2>
      <ul>
        <li>
          The laundry you choose does the washing and sets its prices, so refunds for a wash (damage, a missing item, a wrong charge) are
          decided by that laundry. Tell them, or us, within <b>48 hours</b> of getting your clothes back, with your order number.
        </li>
        <li>
          You&apos;re charged for the weight confirmed at pickup, and you see both the basket&apos;s reading and the driver&apos;s. If you think
          the weight is wrong, raise it before paying and the laundry will check it.
        </li>
        <li>A pickup you cancel before the driver collects it costs nothing.</li>
      </ul>

      <h2>The Toss basket{plan && plan.basketPrice > 0 ? ` (${inr(plan.basketPrice)})` : ""}</h2>
      <ul>
        <li>
          If it arrives faulty or stops working because of a fault within <b>7 days</b>, tell us and we&apos;ll repair or replace it. If we
          can&apos;t, we refund the full price.
        </li>
        <li>Each box is printed to order in the colour you pick, so we can&apos;t take it back if you change your mind once it&apos;s made.</li>
        <li>You can cancel an order for a basket for a full refund until we start printing it.</li>
      </ul>

      <h2>Basket credit</h2>
      <p>
        {plan && plan.basketCredit > 0 ? `The ${inr(plan.basketCredit)} of laundry credit` : "Laundry credit"} that comes with a basket is a
        discount on pickups, not cash: it can&apos;t be refunded or exchanged, and unused credit expires
        {plan && plan.creditValidDays > 0 ? ` ${plan.creditValidDays} days after it's added` : ""}. If a basket is refunded, its credit is
        cancelled. See the <Link href="/terms#basket-credit">credit terms</Link>.
      </p>

      <h2>Subscriptions for laundries</h2>
      <ul>
        <li>
          Plans are paid in advance on Toss&apos;s secure payment page (card, UPI, netbanking or wallet in India; card in US dollars
          elsewhere).
        </li>
        <li>
          If you turn on <b>automatic renewal</b>, your plan is charged once a month until you turn it off under Billing &rarr; Renew
          automatically. Turning it off stops all future charges straight away. Without it, plans never renew on their own: just don&apos;t
          pay for the next period.
        </li>
        <li>A period you&apos;ve started isn&apos;t refunded for the days left, but the plan stays on until it ends.</li>
        <li>
          Paid twice by mistake, or a payment we couldn&apos;t verify and turned down? We refund it in full. A business we suspend for
          breaking the Terms isn&apos;t refunded for the days left.
        </li>
      </ul>

      <h2>How refunds are paid</h2>
      <p>
        Approved refunds go back the way you paid (card, UPI, bank account or PayPal), in the same currency, within <b>7 working days</b>. To ask for one, email{" "}
        <a href={`mailto:${email}?subject=Refund%20request`}>{email}</a> with your order number or payment reference. We reply within 2
        working days.
      </p>
    </InfoPage>
  );
}
