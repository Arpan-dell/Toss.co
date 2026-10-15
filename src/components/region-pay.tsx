"use client";

import { useState } from "react";
import { burstFromEvent } from "@/lib/fx";
import type { PayOption } from "@/lib/pay-methods";


// Pay outside UPI: PayPal, Venmo, a SEPA transfer, Pix, a bank transfer… The payer picks a method and pays in their
// own app (a link with the amount filled in, a QR code their bank reads, or details to copy). Nothing to type: the
// laundry marks it paid when the money arrives (or its gateway confirms it, once connected).
export function RegionPay({
  options,
  amountLabel,
  payeeName,
  note,
  buttonLabel,
  startOpen = false,
}: {
  options: PayOption[];
  amountLabel: string;
  payeeName: string;
  /** what happens next, e.g. "Fresh marks it paid when the money arrives." */
  note?: string;
  buttonLabel?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [chosen, setChosen] = useState(options[0]?.id);
  const [copied, setCopied] = useState<string>();
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

      {note && opt.id !== "cash" && <p className="mt-4 border-t border-border pt-3 text-xs text-muted">{note}</p>}
    </div>
  );
}
