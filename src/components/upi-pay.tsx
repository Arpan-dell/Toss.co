"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/shared";
import { burstFromEvent } from "@/lib/fx";

const inputClass =
  "w-full rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 font-mono text-sm tracking-wide transition-shadow placeholder:font-sans placeholder:tracking-normal placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(139_123_255/0.2)] focus:outline-none";

// Pay by UPI: scan the QR (desktop) or tap to open a UPI app (phone). Money goes straight to the
// payee's bank; then the payer submits the UPI reference so the payee can confirm it.
export function UpiPay({
  uri,
  qrSvg,
  amountLabel,
  payeeName,
  payeeUpiId,
  action,
  hidden,
  buttonLabel,
  startOpen = false,
}: {
  uri: string;
  qrSvg: string;
  amountLabel: string;
  payeeName: string;
  payeeUpiId: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  buttonLabel?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  if (!open) {
    return (
      <button
        onClick={(e) => {
          burstFromEvent(e);
          setOpen(true);
        }}
        className="btn-primary rounded-full px-5 py-2 text-sm font-medium"
      >
        {buttonLabel ?? `Pay ${amountLabel} →`}
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-white/[0.03] p-4" style={{ animation: "fade-up 0.4s ease both" }}>
      <div className="grid items-center gap-5 sm:grid-cols-[160px_1fr]">
        <div
          className="mx-auto w-40 overflow-hidden rounded-xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
          aria-label={`UPI QR code to pay ${amountLabel} to ${payeeName}`}
          role="img"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{amountLabel}</p>
            <p className="text-secondary">
              to <span className="text-fg">{payeeName}</span> · <span className="font-mono text-xs">{payeeUpiId}</span>
            </p>
          </div>
          <p className="text-xs text-muted">Scan with GPay, PhonePe, Paytm or any UPI app, or on your phone:</p>
          <a href={uri} className="btn-ghost inline-flex rounded-full px-4 py-1.5 text-sm">
            Open UPI app ↗
          </a>
        </div>
      </div>

      {state.message ? (
        <p role="status" className="mt-4 rounded-xl border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-4 space-y-2 border-t border-border pt-4">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="block text-xs text-secondary" htmlFor={`ref-${hidden.orderId ?? hidden.months}`}>
            Paid? Enter the UPI reference / UTR from your payment app
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`ref-${hidden.orderId ?? hidden.months}`}
              name="ref"
              inputMode="text"
              autoComplete="off"
              placeholder="e.g. 412356789012"
              required
              className={inputClass}
            />
            <button disabled={pending} className="btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-medium disabled:opacity-70">
              {pending ? "Sending…" : "I've paid"}
            </button>
          </div>
          {state.error && <p role="alert" className="text-sm text-critical">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
