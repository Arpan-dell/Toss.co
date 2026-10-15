"use client";

import { useState, useTransition } from "react";
import { burstFromEvent } from "@/lib/fx";

// Pay a bill (or the Toss subscription) on the gateway's own page. The server works out the amount and opens the
// page; when the gateway confirms the payment, Toss marks it paid by itself. Customers abroad can add a tip.
export function GatewayPay({
  start,
  amountLabel,
  gatewayName,
  tip,
}: {
  start: (tip: number) => Promise<{ url?: string; error?: string }>;
  amountLabel: string;
  gatewayName: string;
  tip?: { symbol: string; suggestions: { value: number; label: string }[] };
}) {
  const [tipValue, setTipValue] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, go] = useTransition();

  return (
    <div className="space-y-3">
      {tip && (
        <fieldset>
          <legend className="mb-1.5 text-xs text-secondary">Add a tip for your driver? (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {[{ value: 0, label: "No tip" }, ...tip.suggestions].map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setTipValue(s.value)}
                aria-pressed={tipValue === s.value}
                className={`rounded-full border px-3 py-1 text-sm ${tipValue === s.value ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-secondary"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          burstFromEvent(e);
          setError(undefined);
          go(async () => {
            const r = await start(tipValue);
            if (r.url) window.location.assign(r.url);
            else setError(r.error ?? "Couldn't open the payment page.");
          });
        }}
        className="btn-primary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-70"
      >
        {pending ? "Opening…" : `Pay ${amountLabel}${tipValue ? ` + ${tip?.symbol ?? ""}${tipValue} tip` : ""} →`}
      </button>
      <p className="text-xs text-muted">Secure payment by {gatewayName}. Confirmed automatically; no reference to type.</p>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
