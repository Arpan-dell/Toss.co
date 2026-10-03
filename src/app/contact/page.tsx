import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Toss: baskets, laundries joining the platform, account help and privacy requests.",
};

const EMAIL = "toss.smartlaundry@gmail.com";

const REASONS = [
  { title: "Buy a basket", body: "Pick a colour and leave your number and email. We'll reply about availability, price and delivery.", href: "/#buy", cta: "Ask about a basket" },
  { title: "Run a laundry", body: "Put your business on Toss: live pickups, drivers, weighing and UPI payments, and a listing in the directory.", href: "/login", cta: "Get started" },
  { title: "Account or order help", body: "Something wrong with a pickup, a weight or an invoice? Email us with your customer ID (shown on your dashboard).", href: `mailto:${EMAIL}?subject=Help%20with%20my%20account`, cta: "Email support" },
  { title: "Privacy request", body: "Ask what we hold about you, or have it corrected or deleted.", href: `mailto:${EMAIL}?subject=Privacy%20request`, cta: "Send a request" },
];

export default function ContactPage() {
  return (
    <InfoPage kicker="Contact" title="Talk to a person.">
      <p>
        The quickest way to reach us is email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We usually reply within a working day.
      </p>
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        {REASONS.map((r) => (
          <div key={r.title} className="flex flex-col rounded-[10px] border border-border bg-surface-solid p-5">
            <p className="font-semibold text-fg">{r.title}</p>
            <p className="mt-1.5 flex-1 text-sm">{r.body}</p>
            {r.href.startsWith("/") ? (
              <Link href={r.href} className="mt-4 text-sm font-medium">
                {r.cta} →
              </Link>
            ) : (
              <a href={r.href} className="mt-4 text-sm font-medium">
                {r.cta} →
              </a>
            )}
          </div>
        ))}
      </div>
      <p className="pt-2 text-sm">
        Drivers for a laundry on Toss work through the <a href="https://t.me/toss_driver_bot">driver bot on Telegram</a>. Customers with a
        basket control it from the Toss Control bot their basket was set up with.
      </p>
    </InfoPage>
  );
}
