import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Toss collects, why, who it's shared with, and how to get it corrected or deleted.",
};

const EMAIL = "toss.smartlaundry@gmail.com";

// Kept in step with the code: if a new field, service or cookie is added, update this page.
export default function PrivacyPage() {
  return (
    <InfoPage kicker="Privacy Policy" title="Your data, in plain words." updated="3 October 2026">
      <p>
        Toss (&ldquo;we&rdquo;) runs this website, the Toss baskets and the Telegram bots that go with them. This page explains what we
        collect, why, and what you can ask us to do with it. If anything is unclear, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Account details:</b> your name, email address and, if you add it, your phone number. If you sign in with Google we receive your
          name and email from Google; we never see your Google password.
        </li>
        <li>
          <b>Pickup details:</b> your pickup address, the area it&apos;s in, and its map position so the nearest driver can be sent.
        </li>
        <li>
          <b>Basket readings:</b> the weight in your basket, the target weight you set, and whether the basket is online.
        </li>
        <li>
          <b>Orders and payments:</b> each pickup&apos;s weight, price, status and times, and the UPI reference or cash note used to mark it
          paid. We never see or store card or bank details; you pay the laundry directly.
        </li>
        <li>
          <b>Telegram:</b> your Telegram user ID, when you link your account or use one of our bots, so the bot can talk to you.
        </li>
        <li>
          <b>Location when you search:</b> if you use &ldquo;Use my location&rdquo; in <Link href="/laundries">Find a laundry</Link>, your
          position is used for that search. If you&apos;re signed in as a customer we remember it so you don&apos;t have to share it again.
        </li>
        <li>
          <b>Basket requests:</b> the name, phone, email, city and message you send when you ask about buying a basket.
        </li>
        <li>
          <b>Security records:</b> to stop abuse we count sign-in and form attempts. The network address used for this is stored only as a
          one-way hash, and each record is only a short running count.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run pickups: book them, send a driver, weigh, price and invoice them.</li>
        <li>To send you messages you&apos;d expect: pickup updates, invoices, password resets and replies to your requests.</li>
        <li>To show a laundry the customers and orders that belong to it, and nothing from any other laundry.</li>
        <li>To keep accounts safe and the service working.</li>
      </ul>
      <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>

      <h2>Who sees it</h2>
      <ul>
        <li>
          <b>Your laundry</b> sees what it needs to serve you: your name, contact, address, basket and orders. Its drivers see the pickup
          address and order for the job they accept.
        </li>
        <li>
          <b>Services we run on:</b> Supabase (database and sign-in), Vercel (hosting), Google (sign-in with Google, and email delivery
          through Gmail), Telegram (the bots) and OpenStreetMap (maps and turning addresses into map positions).
        </li>
        <li>
          <b>Toss AI</b> uses Google&apos;s Gemini to write a laundry&apos;s morning briefing. It is only ever sent totals and customer codes,
          never names, phone numbers, emails or addresses.
        </li>
        <li>We may share data if the law requires it.</li>
      </ul>

      <h2>Cookies and storage</h2>
      <p>
        We use only the cookies needed to keep you signed in. They can&apos;t be read by scripts on the page and are only sent over a secure
        connection. Your browser also remembers your light or dark theme choice. There are no advertising or tracking cookies.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and order history while your account is open, because laundries need past orders and invoices. Password reset
        links expire after a short time, and security counters only ever hold a short running count.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Change your phone number from your dashboard and your pickup address from the Toss Control bot.</li>
        <li>
          Ask us for a copy of your data, or to correct or delete it, by emailing <a href={`mailto:${EMAIL}?subject=Privacy%20request`}>{EMAIL}</a>{" "}
          from the address on your account. We&apos;ll reply within 30 days. A laundry may need to keep invoices it is legally required to
          keep.
        </li>
        <li>
          Sharing your location is optional: you can type your area instead. To remove a saved location, unlink Telegram or change anything
          else, email us.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Data travels over HTTPS, each laundry can only reach its own records, passwords are stored hashed by our sign-in provider, and secret
        keys never reach your browser. No system is perfect; if we ever learn of a breach that affects you, we&apos;ll tell you.
      </p>

      <h2>Children</h2>
      <p>Toss is meant for adults. If you&apos;re under 18, use it with a parent or guardian.</p>

      <h2>Changes</h2>
      <p>If we change this policy we&apos;ll update the date at the top, and tell signed-in users about anything important.</p>
    </InfoPage>
  );
}
