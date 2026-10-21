"use client";

import { useState } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { PasswordField } from "@/components/password-field";
import { connectGateway } from "@/lib/actions/gateway";
import type { FormState } from "@/lib/actions/shared";

type Gateway = "razorpay" | "stripe" | "dodo";
const LABEL: Record<Gateway, string> = {
  razorpay: "Razorpay (India: UPI, cards, netbanking)",
  stripe: "Stripe (cards, Apple Pay, Google Pay, local methods)",
  dodo: "Dodo Payments (cards worldwide, handles sales tax)",
};

type Props = {
  suggested: Gateway;
  /** which gateways to offer (laundries: Razorpay and Stripe; Toss's own dollar plans can also use Dodo) */
  providers?: Gateway[];
  /** Dodo only: the webhook URL to add in Dodo, and the monthly plan price its subscription product must have */
  dodo?: { webhookUrl: string; monthlyPrice: string };
  /** who's connecting: a laundry (default) or the owner for Toss's subscriptions */
  action?: (prev: FormState, fd: FormData) => Promise<FormState>;
  hidden?: Record<string, string>;
  /** a Razorpay connection without a webhook yet: show how to add one (optional, makes confirmation instant) */
  pendingRazorpay?: { webhookUrl: string; live: boolean };
};

// Connect Razorpay (India) or Stripe (elsewhere). Razorpay takes two steps (keys, then the webhook secret, since
// Razorpay only shows the secret you type when you create the webhook); Stripe takes one.
export function GatewayForm({ suggested, pendingRazorpay, action = connectGateway, hidden = {}, providers = ["razorpay", "stripe"], dodo }: Props) {
  const extra = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  const [provider, setProvider] = useState<Gateway>(pendingRazorpay ? "razorpay" : suggested);
  const [copied, setCopied] = useState(false);

  if (pendingRazorpay) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-secondary">
          <li>
            In the Razorpay Dashboard ({pendingRazorpay.live ? "Live" : "Test"} mode), open <b className="text-fg">Account &amp; Settings → Webhooks</b> and
            choose <b className="text-fg">Add New Webhook</b>.
          </li>
          <li>
            Webhook URL:
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="rounded-[6px] border border-border bg-ink/[0.04] px-2 py-1 text-xs break-all text-fg">{pendingRazorpay.webhookUrl}</code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pendingRazorpay.webhookUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
                className="text-xs text-accent hover:text-accent-2"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </span>
          </li>
          <li>
            Type a secret of your own (any long password) and tick the events <b className="text-fg">payment_link.paid</b>,{" "}
            <b className="text-fg">payment_link.expired</b> and <b className="text-fg">payment_link.cancelled</b>. For automatic payments also tick{" "}
            <b className="text-fg">payment.captured</b>, <b className="text-fg">payment.failed</b>, <b className="text-fg">invoice.paid</b> and every{" "}
            <b className="text-fg">subscription.*</b> event. Save.
          </li>
          <li>Paste that same secret below.</li>
        </ol>
        <ActionForm action={action} submitLabel="Add webhook">
          {extra}
          <input type="hidden" name="provider" value="razorpay" />
          <Field label="Webhook secret" hint="The secret you typed in Razorpay. Toss uses it to check every payment message really came from Razorpay.">
            <input name="webhookSecret" required minLength={8} autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
          <PasswordField />
        </ActionForm>
      </div>
    );
  }

  return (
    <ActionForm action={action} submitLabel="Check and connect">
      {extra}
      <fieldset>
        <legend className="mb-1.5 text-sm text-secondary">Gateway</legend>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <label
              key={p}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${provider === p ? "border-accent/60 bg-accent/15 font-medium text-accent" : "border-border text-secondary"}`}
            >
              <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => setProvider(p)} className="sr-only" />
              {LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
      {provider === "dodo" && dodo ? (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-secondary">
            <li>
              In the Dodo dashboard, open <b className="text-fg">Products</b> and create a <b className="text-fg">one-time</b> product called
              &ldquo;Toss Pro&rdquo; in <b className="text-fg">USD</b> with <b className="text-fg">Pay What You Want</b> turned on (minimum $1). Toss
              sets the amount for 1, 3, 6 or 12 months.
            </li>
            <li>
              For automatic renewal (optional), create a <b className="text-fg">subscription</b> product billed <b className="text-fg">monthly</b> at
              exactly <b className="text-fg">{dodo.monthlyPrice}</b>, your plan price.
            </li>
            <li>
              Open <b className="text-fg">Developer → Webhooks</b>, add this URL, and tick <b className="text-fg">payment.succeeded</b>,{" "}
              <b className="text-fg">payment.failed</b> and every <b className="text-fg">subscription.*</b> event:
              <CopyUrl url={dodo.webhookUrl} />
              Then copy the webhook&apos;s <b className="text-fg">signing secret</b> (it starts with whsec_).
            </li>
            <li>
              Open <b className="text-fg">Developer → API Keys</b> and create a key. Use <b className="text-fg">Test mode</b> first to try it without
              real money.
            </li>
          </ol>
          <Field label="API key" hint="Stored encrypted. Toss finds out by itself whether it's a test or live key.">
            <input name="secret" type="password" required autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Webhook signing secret">
            <input name="webhookSecret" required autoComplete="off" placeholder="whsec_…" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="One-time product ID" hint="Products → the Toss Pro product → its ID.">
            <input name="productOnce" required autoComplete="off" placeholder="pdt_…" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Monthly product ID (optional)" hint="Only for automatic monthly renewal.">
            <input name="productMonthly" autoComplete="off" placeholder="pdt_…" className={`${fieldClass} font-mono`} />
          </Field>
        </>
      ) : provider === "razorpay" ? (
        <>
          <p className="text-sm text-secondary">
            In the Razorpay Dashboard, open <b className="text-fg">Account &amp; Settings → API Keys</b> and generate a key. Use{" "}
            <b className="text-fg">Test mode</b> first to try it without real money.
          </p>
          <Field label="Key ID">
            <input name="keyId" required autoComplete="off" placeholder="rzp_live_…" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Key secret" hint="Stored encrypted. Toss uses it only to create payment pages and check payments.">
            <input name="secret" type="password" required autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
        </>
      ) : (
        <>
          <p className="text-sm text-secondary">
            In the Stripe Dashboard, open <b className="text-fg">Developers → API keys</b> and copy the <b className="text-fg">secret key</b> (or create a
            restricted key with write access to Checkout Sessions and Webhook Endpoints). Toss sets up its webhook on your account itself.
          </p>
          <Field label="Secret key" hint="Stored encrypted. Use a test key (sk_test_…) first to try it without real money.">
            <input name="secret" type="password" required autoComplete="off" placeholder="sk_live_…" className={`${fieldClass} font-mono`} />
          </Field>
        </>
      )}
      <PasswordField />
    </ActionForm>
  );
}

// A URL to paste into the gateway's dashboard, with a copy button.
function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="my-1.5 flex flex-wrap items-center gap-2">
      <code className="rounded-[6px] border border-border bg-ink/[0.04] px-2 py-1 text-xs break-all text-fg">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
        className="text-xs text-accent hover:text-accent-2"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
    </span>
  );
}
