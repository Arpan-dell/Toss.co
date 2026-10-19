"use client";

import { useState, useTransition } from "react";
import type { Renewal } from "@/lib/gateway-payments";

// "Renew automatically": approve a monthly subscription once on Toss's gateway, and the plan extends itself
// every month. The usual way to pay for software abroad; in India it uses a card or UPI Autopay.
export function AutoRenew({
  status,
  start,
  stop,
  priceLabel,
  gatewayName,
  firstCharge,
  india,
}: {
  status: Renewal | null;
  start: () => Promise<{ url?: string; error?: string }>;
  stop: () => Promise<void>;
  priceLabel: string;
  gatewayName: string;
  firstCharge?: string;
  india: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, go] = useTransition();
  const on = status?.status === "active" || status?.status === "failing";

  const begin = () =>
    go(async () => {
      setError(undefined);
      const r = await start();
      if (r.url) window.location.assign(r.url);
      else setError(r.error ?? "Couldn't open the page.");
    });

  if (on) {
    return (
      <div className="space-y-3">
        {status.status === "failing" ? (
          <p className="rounded-[8px] border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
            The last automatic payment didn&apos;t go through. {gatewayName} tries again over the next few days; to use another card, turn this
            off and on again.
          </p>
        ) : (
          <p className="text-sm text-secondary">
            <span className="text-good">On.</span> {priceLabel} is charged every month and your plan extends by itself
            {status.lastChargedAt ? `; last charged ${new Date(status.lastChargedAt).toLocaleDateString()}` : firstCharge ? `, starting ${firstCharge}` : ""}.
          </p>
        )}
        <button type="button" disabled={pending} onClick={() => go(() => stop())} className="btn-ghost rounded-full px-4 py-1.5 text-sm disabled:opacity-70">
          {pending ? "…" : "Turn off automatic renewal"}
        </button>
        <p className="text-xs text-muted">Turning it off stops future charges. The time you&apos;ve paid for stays.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        Pay {priceLabel} a month automatically and never lose Pro.
        {firstCharge ? ` Nothing is charged until ${firstCharge}, when your current time runs out.` : ""}{" "}
        {india ? "Approve it once with a card or UPI Autopay; your bank tells you before each charge." : "Approve it once with a card, Apple Pay or Google Pay."}
      </p>
      <button type="button" disabled={pending} onClick={begin} className="btn-primary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-70">
        {pending ? "Opening…" : "Turn on automatic renewal →"}
      </button>
      <p className="text-xs text-muted">Secured by {gatewayName}. Cancel anytime here.</p>
      {status?.status === "created" && <p className="text-xs text-warn">Not finished yet: open the page again to approve it.</p>}
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
