"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie } from "@phosphor-icons/react";

// The cookie notice. Toss only uses essential cookies (sign-in) and a saved theme choice, with no analytics or
// advertising, so there's nothing to consent to: the notice says so plainly, with one button and a link to the
// policy. No pre-ticked boxes and no "reject" that does nothing. Shown once per browser; it sits bottom-left so it
// never covers the assistant button (bottom-right) or blocks the page.
const KEY = "toss-cookie-notice";

export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {}
    if (seen) return;
    const id = window.setTimeout(() => setShow(true), 1200); // after the page settles, never during first paint
    return () => window.clearTimeout(id);
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };
  return (
    <section
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 max-w-sm rounded-2xl border border-border bg-surface-solid p-4 text-sm shadow-[0_20px_50px_-20px_rgb(0_0_0/0.5)] sm:inset-x-auto sm:bottom-24 sm:left-6"
    >
      <p className="flex gap-2.5 text-secondary">
        <Cookie size={20} weight="duotone" aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <span>
          We only use cookies that keep you signed in and remember your theme. <b className="text-fg">No ads, analytics or tracking.</b>{" "}
          <Link href="/cookies" className="text-accent underline-offset-4 hover:underline">
            Cookie policy
          </Link>
        </span>
      </p>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={close} className="btn-primary rounded-full px-5 py-2 text-sm font-medium">
          Got it
        </button>
      </div>
    </section>
  );
}
