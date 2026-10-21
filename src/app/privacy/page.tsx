import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "Privacy Policy",
  description: "What Toss collects, why, who it's shared with, and how to get it corrected or deleted.",
};

const EMAIL = BUSINESS.email;

// Kept in step with the code: if a new field, service or cookie is added, update this page.
export default function PrivacyPage() {
  return (
    <InfoPage kicker="Privacy Policy" title="Your data, in plain words." updated="21 October 2026">
      <p>
        {BUSINESS.legalName || BUSINESS.brand} (&ldquo;Toss&rdquo;, &ldquo;we&rdquo;), {BUSINESS.address || BUSINESS.city}, runs this website,
        the Toss baskets and the Telegram bots that go with them. This page explains what we
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
          <b>Orders and payments:</b> each pickup&apos;s weight, price, status and times, and the payment reference (a UPI reference,
          PayPal or bank transfer ID, and so on) or cash note used to mark it paid, plus any tip you add. We never see or store card or bank
          details; you pay the laundry directly, in its own app or bank.
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
          <b>Questions to the assistant:</b> what you type into the in-app assistant, to answer it. The conversation stays in your browser tab
          and is cleared when you close it; we don&apos;t keep it.
        </li>
        <li>
          <b>Privacy and email choices:</b> requests you make to delete your data, and the email address and kind of email you unsubscribe
          from, so we respect it.
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
          <b>Services we run on,</b> each getting only what it needs:
          <ul>
            <li>Supabase: stores the database and handles sign-in.</li>
            <li>Vercel: hosts the website and the app, and sees your network address when you load a page.</li>
            <li>Google: sign-in, only if you choose &ldquo;Continue with Google&rdquo;, and sending our emails through Gmail.</li>
            <li>Telegram: runs the bots, and gets your messages to them.</li>
            <li>
              OpenStreetMap: shows maps, and turns a typed address or area into a map position, so that address text is sent to it.
            </li>
            <li>
              Google Gemini (AI): writes a laundry&apos;s morning briefing from totals and customer codes, and helps the assistant understand
              questions and give advice. It gets your typed question and counts and totals; never names, phone numbers, emails, addresses or
              locations.
            </li>
          </ul>
        </li>
        <li>
          <b>Where it&apos;s stored:</b> these services run on servers that may be outside your country (our hosting runs in Singapore).
          They protect the data under their own security and privacy terms. For people in the European Economic Area, the UK and
          Switzerland, transfers rely on the providers&apos; standard contractual clauses.
        </li>
        <li>We may share data if the law requires it.</li>
      </ul>

      <h2>Cookies and storage</h2>
      <p>
        We use only the cookies needed to keep you signed in. They can&apos;t be read by scripts on the page and are only sent over a secure
        connection. Your browser also remembers your light or dark theme choice. There are no advertising or tracking cookies.
        Every cookie and storage item is listed in the <Link href="/cookies">Cookie Policy</Link>.
      </p>

      <h2>Page counts and error reports</h2>
      <ul>
        <li>
          <b>Page counts:</b> we count visits to pages with Vercel Web Analytics, which uses no cookies and doesn&apos;t follow you across other
          sites or build a profile of you. It records which page was opened, roughly where from (country) and which kind of device and browser.
          It never sees your name, email, phone or what you type.
        </li>
        <li>
          <b>Error reports:</b> when something breaks, we keep a short note of what failed for 30 days so we can fix it. Names, emails, phone
          numbers, IDs and keys are removed before anything is saved.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and order history while your account is open, because laundries need past orders and invoices. When you ask
        us to delete your data we do it within 30 days, except invoices, which are kept for as long as Indian tax law requires, with your
        name removed where the law allows. Basket requests are deleted once they&apos;re dealt with. Password reset links expire after a
        short time, and security counters only ever hold a short running count.
      </p>

      <h2>Your rights and choices</h2>
      <p>
        Under India&apos;s Digital Personal Data Protection Act you can ask what we hold about you, have it corrected or completed, have it
        deleted, withdraw consent, name someone to act for you, and complain to us (and then to the Data Protection Board of India).
      </p>
      <ul>
        <li>Change your phone number from your dashboard and your pickup address from the Toss Control bot.</li>
        <li>
          Ask us for a copy of your data, or to correct or delete it, by emailing <a href={`mailto:${EMAIL}?subject=Privacy%20request`}>{EMAIL}</a>{" "}
          from the address on your account. We&apos;ll reply within 30 days. A laundry may need to keep invoices it is legally required to
          keep.
        </li>
        <li>
          Have your account and data deleted with the <Link href="/data-deletion">Delete my data</Link> form.
        </li>
        <li>Stop optional emails (reminders and alerts) with the unsubscribe link at the bottom of any of them.</li>
        <li>
          Sharing your location is optional: you can type your area instead. To remove a saved location, unlink Telegram or change anything
          else, email us.
        </li>
      </ul>
      <p>
        <b>In the EU, EEA, UK or Switzerland (GDPR):</b> you also have the right to object to how we use your data, to restrict it, and to
        take it with you (data portability). We use your data to provide the service you signed up for (contract), to keep it secure and
        improve it (legitimate interest), and, where we ask, with your consent, which you can withdraw at any time. You can complain to your
        local data protection authority.
      </p>
      <p>
        <b>In California (CCPA/CPRA) and other US states with privacy laws:</b> you can ask what personal information we collected and why,
        have it corrected or deleted, and not be treated differently for asking. <b>We do not sell or share personal information</b> for
        advertising, and we don&apos;t use it for profiling. Send requests to the email above; you can also ask someone to act for you.
      </p>

      <h2>Security</h2>
      <p>
        Data travels over HTTPS, each laundry can only reach its own records, passwords are stored hashed by our sign-in provider, and secret
        keys never reach your browser. No system is perfect; if we ever learn of a breach that affects you, we&apos;ll tell you.
      </p>

      <h2>Grievance officer</h2>
      <p>
        Complaints about your data go to {BUSINESS.grievance.name ? <b>{BUSINESS.grievance.name}</b> : "our grievance officer"} at{" "}
        <a href={`mailto:${BUSINESS.grievance.email}?subject=Grievance`}>{BUSINESS.grievance.email}</a>. We acknowledge within 2 working days
        and resolve within {BUSINESS.grievance.replyDays} days. See <Link href="/contact">Contact</Link> for our business details.
      </p>

      <h2>Children</h2>
      <p>Toss is meant for adults. If you&apos;re under 18, use it with a parent or guardian.</p>

      <h2>Changes</h2>
      <p>If we change this policy we&apos;ll update the date at the top, and tell signed-in users about anything important.</p>
    </InfoPage>
  );
}
