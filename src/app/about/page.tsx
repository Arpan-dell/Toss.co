import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";

export const metadata: Metadata = {
  title: "About",
  description: "Toss makes laundry baskets that order their own pickup, and the platform laundries run on.",
};

export default function AboutPage() {
  return (
    <InfoPage kicker="About Toss" title="Laundry that orders itself.">
      <p>
        Toss started with a simple annoyance: the laundry basket fills up, nobody notices until there&apos;s nothing left to wear, and then
        someone has to call the laundry, wait, and explain the address again.
      </p>
      <p>
        So we built a small box that sits under any laundry basket. It weighs the clothes as they pile up and, when the basket reaches the
        weight you set, it books the pickup by itself. You check it, zero it and change its settings from a Telegram bot, so there&apos;s no
        app to install.
      </p>

      <h2>What Toss is</h2>
      <ul>
        <li>
          <b>The Toss basket.</b> A 3D-printed box with a load cell and a Wi-Fi chip, printed in the colour you choose and powered from any
          USB-C wall charger.
        </li>
        <li>
          <b>The platform.</b> Laundries use Toss to see every pickup live, send the nearest driver, weigh and price each order, collect
          payment over UPI or cash, and get a morning briefing on what needs attention.
        </li>
        <li>
          <b>The directory.</b> Customers can <Link href="/laundries">find the laundries</Link> that pick up where they live and compare them
          on distance, price and speed.
        </li>
      </ul>

      <h2>How we work</h2>
      <ul>
        <li>We keep the hardware cheap and the software free to start, so a small neighbourhood laundry can use the same tools as a big one.</li>
        <li>We collect only what a pickup needs, and we never sell your data. The <Link href="/privacy">privacy policy</Link> spells it out.</li>
        <li>We&apos;re a small team in New Delhi, and you can reach a real person at <a href="mailto:toss.smartlaundry@gmail.com">toss.smartlaundry@gmail.com</a>.</li>
      </ul>

      <p className="pt-4">
        Want one for your home, PG or laundry? <Link href="/#buy">Ask about a basket</Link> or <Link href="/contact">get in touch</Link>.
      </p>
    </InfoPage>
  );
}
