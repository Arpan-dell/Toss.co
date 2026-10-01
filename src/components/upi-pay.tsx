"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import type { FormState } from "@/lib/actions/shared";
import { burstFromEvent } from "@/lib/fx";
import { detectUpiPlatform, upiAppLinks, type UpiPlatform } from "@/lib/upi";

const inputClass =
  "w-full rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 font-mono text-sm tracking-wide transition-shadow placeholder:font-sans placeholder:tracking-normal placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(139_123_255/0.2)] focus:outline-none";

const noopSubscribe = () => () => {};

// Pay by UPI. On a phone: one button per UPI app, each opening that exact app with the payee's
// UPI ID and the amount already filled in, so the payer just taps Pay. On a computer: a QR code to
// scan with any UPI app. Money goes straight to the payee; the payer then submits the UPI reference.
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
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  // The user agent never changes, so there's nothing to subscribe to. The server renders the
  // desktop layout; the browser then switches to app buttons on phones.
  const platform = useSyncExternalStore<UpiPlatform>(
    noopSubscribe,
    () => detectUpiPlatform(navigator.userAgent),
    () => "desktop",
  );

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

  const apps = upiAppLinks(uri, platform);
  const isPhone = platform !== "desktop";
  const fieldId = `ref-${hidden.orderId ?? hidden.months}`;

  const qr = (
    <div
      className="mx-auto w-44 overflow-hidden rounded-xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
      aria-label={`UPI QR code to pay ${amountLabel} to ${payeeName}`}
      role="img"
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );

  return (
    <div className="w-full rounded-2xl border border-border bg-white/[0.03] p-4" style={{ animation: "fade-up 0.4s ease both" }}>
      {/* What's being paid, to whom: exactly what the UPI app will show pre-filled. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{amountLabel}</p>
          <p className="text-sm text-secondary">
            to <span className="text-fg">{payeeName}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(payeeUpiId);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the UPI ID is visible to copy by hand */
            }
          }}
          className="rounded-lg border border-border px-2.5 py-1 font-mono text-xs text-secondary hover:text-fg"
          aria-label={`Copy UPI ID ${payeeUpiId}`}
        >
          {payeeUpiId} · {copied ? "copied ✓" : "copy"}
        </button>
      </div>

      {isPhone ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">Choose your UPI app. The amount and UPI ID are filled in; just tap Pay.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {apps.map((app) => (
              <a
                key={app.id}
                href={app.href}
                data-ripple
                className="flex items-center gap-2.5 rounded-xl border border-border bg-white/[0.04] px-3 py-2.5 text-sm font-medium transition-colors hover:border-border-strong hover:bg-white/[0.08]"
              >
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ background: app.color }}
                >
                  {app.id === "other" ? "₹" : app.name[0]}
                </span>
                <span className="truncate">{app.name}</span>
              </a>
            ))}
          </div>
          <button type="button" onClick={() => setShowQr((v) => !v)} className="mt-3 text-xs text-accent hover:text-accent-2">
            {showQr ? "Hide QR code" : "Paying from another phone? Show QR code"}
          </button>
          {showQr && <div className="mt-3">{qr}</div>}
        </div>
      ) : (
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[176px_1fr]">
          {qr}
          <p className="text-sm text-secondary">
            Scan with <span className="text-fg">Google Pay, PhonePe, Paytm, BHIM</span> or any UPI app. The amount and UPI ID
            fill in automatically. On your phone, this page shows a button for each app instead.
          </p>
        </div>
      )}

      {state.message ? (
        <p role="status" className="mt-4 rounded-xl border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-4 space-y-2 border-t border-border pt-4">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="block text-xs text-secondary" htmlFor={fieldId}>
            After paying, enter the UPI reference / UTR (12 digits, in your app&apos;s payment details)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id={fieldId} name="ref" inputMode="numeric" autoComplete="off" placeholder="e.g. 412356789012" required className={inputClass} />
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
