"use client";

import { useState, useSyncExternalStore } from "react";
import { burstFromEvent } from "@/lib/fx";
import { detectUpiPlatform, upiAppLinks, type UpiPlatform } from "@/lib/upi";


const noopSubscribe = () => () => {};

// Pay by UPI. On a phone: one button per UPI app, each opening that exact app with the payee's
// UPI ID and the amount already filled in, so the payer just taps Pay. On a computer: a QR code to
// scan with any UPI app. Money goes straight to the payee, who confirms it (or the gateway does, when connected).
export function UpiPay({
  uri,
  qrSvg,
  amountLabel,
  payeeName,
  payeeUpiId,
  note,
  buttonLabel,
  startOpen = false,
}: {
  uri: string;
  qrSvg: string;
  amountLabel: string;
  payeeName: string;
  payeeUpiId: string;
  /** what happens next, e.g. "Fresh marks it paid when the money arrives." */
  note?: string;
  buttonLabel?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const qr = (
    <div
      className="mx-auto w-44 overflow-hidden rounded-[8px] bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
      aria-label={`UPI QR code to pay ${amountLabel} to ${payeeName}`}
      role="img"
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );

  return (
    <div className="w-full rounded-[10px] border border-border bg-ink/[0.03] p-4" style={{ animation: "fade-up 0.4s ease both" }}>
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
          title="Copy UPI ID"
          className="rounded-[6px] border border-border px-2.5 py-1 font-mono text-xs text-secondary hover:text-fg"
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
                className="flex items-center gap-2.5 rounded-[8px] border border-border bg-ink/[0.04] px-3 py-2.5 text-sm font-medium transition-colors hover:border-border-strong hover:bg-ink/[0.08]"
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

      {note && <p className="mt-4 border-t border-border pt-3 text-xs text-muted">{note}</p>}
    </div>
  );
}
