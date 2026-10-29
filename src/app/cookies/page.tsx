import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/info-page";

export const metadata: Metadata = {
  alternates: { canonical: "/cookies" },
  title: "Cookie Policy",
  description: "The few cookies and browser storage Toss uses, why, and what we don't use.",
};

// Kept in step with the code: if a cookie, storage key or outside service is added, update this page and the
// cookie notice (components/cookie-notice.tsx).
const COOKIES: [string, string, string][] = [
  ["Sign-in (sb-…-auth-token)", "Keeps you signed in, and checks each request is really you. Can't be read by scripts on the page.", "Until you sign out (renewed while you use Toss)"],
  ["Telegram sign-in (short-lived)", "Only while you sign in with Telegram: protects that sign-in from being hijacked.", "10 minutes"],
  ["Theme (toss-theme)", "Remembers light or dark mode, only after you pick one, so both of our web addresses open the same way.", "1 year"],
];
const STORAGE: [string, string][] = [
  ["Theme (toss-theme)", "A backup copy of your light or dark choice, for browsers that block the cookie."],
  ["Assistant conversation", "The chat with the in-app assistant, for the current tab only; cleared when you close it. Never a password."],
  ["Cookie notice", "That you've seen the notice about cookies, so it doesn't show again."],
  ["Tossy's hello (toss-guide)", "That you've met Tossy, the in-app guide, so its offer of a tour doesn't pop up again."],
  ["Inside Telegram", "When you open Toss from the Telegram bot, a flag for that tab so Telegram's script keeps working as you move between pages."],
];

export default function CookiesPage() {
  return (
    <InfoPage kicker="Cookie Policy" title="Only the cookies we need." updated="29 October 2026">
      <p>
        Toss uses a few essential cookies and some browser storage to work. <b>We don&apos;t use advertising or tracking cookies</b>,
        and we don&apos;t let other companies put cookies on our pages. We count page visits with a cookie-free tool that stores nothing on your
        device and doesn&apos;t track you across sites (see the <Link href="/privacy">Privacy Policy</Link>). Because everything here is needed for the site to work (or only saves a
        choice you made), there&apos;s nothing to accept or reject.
      </p>

      <h2>Cookies</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Cookie</th>
              <th scope="col" className="py-2 pr-3 font-medium">Why</th>
              <th scope="col" className="py-2 font-medium">How long</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {COOKIES.map(([name, why, life]) => (
              <tr key={name}>
                <td className="py-2.5 pr-3 align-top font-medium text-fg">{name}</td>
                <td className="py-2.5 pr-3 align-top">{why}</td>
                <td className="py-2.5 align-top">{life}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Browser storage</h2>
      <ul>
        {STORAGE.map(([name, why]) => (
          <li key={name}>
            <b>{name}:</b> {why}
          </li>
        ))}
      </ul>

      <h2>Outside services on our pages</h2>
      <ul>
        <li>
          <b>OpenStreetMap</b> map tiles load when a page shows a map (your area, or a laundry&apos;s service area). OpenStreetMap sees your
          network address, as any website you load does; it sets no cookies.
        </li>
        <li>
          <b>Telegram&apos;s</b> script loads only when you open Toss inside the Telegram app, never in a normal browser.
        </li>
        <li>
          <b>Google</b> is contacted only when you choose &ldquo;Continue with Google&rdquo;.
        </li>
      </ul>

      <h2>Turning them off</h2>
      <p>
        You can block or delete cookies in your browser&apos;s settings. If you block the sign-in cookie, you won&apos;t be able to sign in; the
        public pages still work. More about your data is in the <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </InfoPage>
  );
}
