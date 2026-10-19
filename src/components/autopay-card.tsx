"use client";

import { useState, useTransition } from "react";
import type { Autopay } from "@/lib/gateway-payments";

const TIPS = [0, 10, 15, 20];

// "Pay automatically", the way laundry apps work in the US and Europe: save a card (or Apple Pay / Google Pay)
// once, choose a tip, and every bill is charged when the laundry marks it ready, with a receipt by email.
export function AutopayCard({
  status,
  start,
  update,
  business,
  provider = "stripe",
}: {
  status: Autopay | null;
  start: (tipPct: number) => Promise<{ url?: string; error?: string }>;
  update: (fd: FormData) => Promise<void>;
  business: string;
  provider?: "stripe" | "razorpay";
}) {
  const india = provider === "razorpay";
  const [tip, setTip] = useState(status?.tipPct ?? (india ? 0 : 15));
  const [error, setError] = useState<string>();
  const [pending, go] = useTransition();

  const tipPicker = (
    <fieldset>
      <legend className="mb-1.5 text-xs text-secondary">Tip for your driver, added to each bill</legend>
      <div className="flex flex-wrap gap-2">
        {TIPS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tip === t}
            onClick={() => {
              setTip(t);
              if (status) {
                const fd = new FormData();
                fd.set("on", status.on ? "1" : "0");
                fd.set("tip", String(t));
                go(() => update(fd));
              }
            }}
            className={`rounded-full border px-3 py-1 text-sm ${tip === t ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-secondary"}`}
          >
            {t ? `${t}%` : "No tip"}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const save = () =>
    go(async () => {
      setError(undefined);
      const r = await start(tip);
      if (r.url) window.location.assign(r.url);
      else setError(r.error ?? "Couldn't open the card page.");
    });

  if (!status) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-secondary">
          {india
            ? `Save your card once. When ${business} has your laundry ready, the bill is paid from it automatically and you get a receipt. Your bank tells you a day before each charge (RBI rule), up to ₹15,000 a bill.`
            : `Save a card, Apple Pay or Google Pay once. When ${business} has your laundry ready, the bill is paid automatically and you get a receipt. No checkout each time.`}
        </p>
        {tipPicker}
        <button type="button" disabled={pending} onClick={save} className="btn-primary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-70">
          {pending ? "Opening…" : "Set up automatic payments →"}
        </button>
        <p className="text-xs text-muted">
          Secured by {india ? "Razorpay" : "Stripe"}. Toss never sees your card number. Turn it off anytime.{india ? " Razorpay checks the card with a ₹1 payment." : ""}
        </p>
        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}
      </div>
    );
  }

  const toggle = (on: boolean) => {
    const fd = new FormData();
    fd.set("on", on ? "1" : "0");
    go(() => update(fd));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary">
        <span className="font-medium text-fg capitalize">{status.brand ?? "Card"}</span>
        {status.last4 ? ` •••• ${status.last4}` : ""}
        {status.exp ? ` · expires ${status.exp}` : ""}
        {" · "}
        {status.on ? <span className="text-good">charged automatically when your laundry is ready</span> : <span className="text-muted">automatic payments are off</span>}
      </p>
      {tipPicker}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => toggle(!status.on)} className="btn-ghost rounded-full px-4 py-1.5 text-sm disabled:opacity-70">
          {status.on ? "Turn off" : "Turn on"}
        </button>
        <button type="button" disabled={pending} onClick={save} className="text-sm text-accent hover:text-accent-2 disabled:opacity-70">
          Use a different card
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
