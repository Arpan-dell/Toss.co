"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/shared";
import { burstFromEvent } from "@/lib/fx";
import type { PayOption } from "@/lib/pay-methods";

const inputClass =
  "w-full rounded-[8px] border border-border bg-ink/[0.03] px-4 py-2.5 text-sm transition-shadow placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none";

// Pay outside UPI: PayPal, Venmo, a SEPA transfer, Pix, a bank transfer… The payer picks a method, pays in their
// own app (a link with the amount filled in, a QR code their bank reads, or details to copy), then types the
// payment's reference so the business can match it. Customers can add a tip for their driver. Cash needs nothing.
export function RegionPay({
  options,
  amountLabel,
  payeeName,
  action,
  hidden,
  buttonLabel,
  startOpen = false,
  tip,
}: {
  options: PayOption[];
  amountLabel: string;
  payeeName: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  buttonLabel?: string;
  startOpen?: boolean;
  /** offer a tip for the driver: suggested amounts, already formatted, and the currency symbol */
  tip?: { suggestions: { value: number; label: string }[]; symbol: string };
}) {
  const [open, setOpen] = useState(startOpen);
  const [chosen, setChosen] = useState(options[0]?.id);
  const [tipValue, setTipValue] = useState(0);
  const [copied, setCopied] = useState<string>();
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const opt = options.find((o) => o.id === chosen) ?? options[0];

  if (!options.length) return null;
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

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(undefined), 1500);
    } catch {
      /* clipboard blocked: the value is on screen to copy by hand */
    }
  };
  const fieldId = `ref-${hidden.orderId ?? hidden.months}`;

  return (
    <div className="w-full rounded-[10px] border border-border bg-ink/[0.03] p-4" style={{ animation: "fade-up 0.4s ease both" }}>
      <div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{amountLabel}</p>
        <p className="text-sm text-secondary">
          to <span className="text-fg">{payeeName}</span>
        </p>
      </div>

      {options.length > 1 && (
        <div role="radiogroup" aria-label="How to pay" className="mt-4 flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={o.id === opt.id}
              onClick={() => setChosen(o.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                o.id === opt.id ? "border-accent/60 bg-accent/15 font-medium text-accent" : "border-border text-secondary hover:text-fg"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {opt.qrSvg && (
          <div
            className="mx-auto w-44 overflow-hidden rounded-[8px] bg-white p-2 sm:mx-0 [&>svg]:h-auto [&>svg]:w-full"
            role="img"
            aria-label={`QR code to pay ${amountLabel} to ${payeeName} by ${opt.label}`}
            dangerouslySetInnerHTML={{ __html: opt.qrSvg }}
          />
        )}
        {opt.note && <p className="text-sm text-secondary">{opt.note}</p>}
        {opt.href && (
          <a href={opt.href} target="_blank" rel="noopener noreferrer" data-ripple className="btn-primary inline-flex rounded-full px-5 py-2 text-sm font-medium">
            {opt.hrefLabel ?? "Open"} ↗
          </a>
        )}
        {opt.details && (
          <dl className="divide-y divide-border rounded-[8px] border border-border text-sm">
            {opt.details.map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <span className="font-mono break-all text-fg">{v}</span>
                  <button type="button" onClick={() => copy(k, v)} className="shrink-0 text-xs text-accent hover:text-accent-2" aria-label={`Copy ${k}`}>
                    {copied === k ? "copied ✓" : "copy"}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {opt.copyText && (
          <button type="button" onClick={() => copy("code", opt.copyText!)} className="btn-ghost rounded-full px-4 py-1.5 text-sm">
            {copied === "code" ? "Code copied ✓" : "Copy payment code"}
          </button>
        )}
      </div>

      {opt.id === "cash" ? null : state.message ? (
        <p role="status" className="mt-4 rounded-[8px] border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-4 space-y-3 border-t border-border pt-4">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="method" value={opt.method} />
          {tip && (
            <fieldset>
              <legend className="mb-1.5 text-xs text-secondary">Add a tip for your driver? (optional, sent with your payment)</legend>
              <div className="flex flex-wrap items-center gap-2">
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
                <label className="flex items-center gap-1 text-sm text-secondary">
                  <span aria-hidden>{tip.symbol}</span>
                  <span className="sr-only">Custom tip</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={tipValue || ""}
                    onChange={(e) => setTipValue(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Other"
                    className="w-20 rounded-[6px] border border-border bg-ink/[0.03] px-2 py-1 text-sm tabular-nums"
                  />
                </label>
              </div>
              <input type="hidden" name="tip" value={String(tipValue)} />
              {tipValue > 0 && <p className="mt-1 text-xs text-muted">Include the tip in what you send: pay the amount above plus {tip.symbol}{tipValue}.</p>}
            </fieldset>
          )}
          <label className="block text-xs text-secondary" htmlFor={fieldId}>
            After paying, enter: {opt.refLabel}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id={fieldId} name="ref" autoComplete="off" placeholder={opt.refPlaceholder} required maxLength={60} className={inputClass} />
            <button disabled={pending} className="btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-medium disabled:opacity-70">
              {pending ? "Sending…" : "I've paid"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-critical">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
