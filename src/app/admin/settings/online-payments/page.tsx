import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card, PageTitle } from "@/components/ui";
import { disconnectGateway } from "@/lib/actions/gateway";
import { getTenantById } from "@/lib/data";
import { webhookUrl } from "@/lib/gateway-payments";
import { myFormat } from "@/lib/my-format";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GatewayForm } from "./gateway-form";

export const metadata: Metadata = { title: "Customer payments" };

// Settings → Online payments: the laundry connects its own Razorpay or Stripe account. Customers then pay on the
// gateway's page and the gateway confirms each payment to Toss directly, so nobody types references and nobody
// checks them by hand. The money goes straight to the laundry's account.
export default async function OnlinePayments() {
  const session = await requireRole("MANAGER");
  const [tenant, fmt] = await Promise.all([getTenantById(session.tenantId), myFormat()]);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const { data: row, error } = await supabaseAdmin()
    .from("tenant_gateways")
    .select("provider, key_id, live, webhook_token, webhook_secret_enc, connected_at, last_event_at")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const ready = !error; // the gateway tables exist (migration 0036)
  const connected = row ?? null;
  // Razorpay works with the keys alone; a webhook (optional) makes confirmation instant
  const noHook = row && !row.webhook_secret_enc && row.provider === "razorpay" ? row : null;
  const name = (p: string) => (p === "razorpay" ? "Razorpay" : "Stripe");

  return (
    <div className="stagger mx-auto w-full max-w-2xl space-y-6">
      <PageTitle kicker="Settings · protected">Customer payments</PageTitle>
      <BackLink />

      <p className="rounded-[8px] border border-border bg-ink/[0.03] px-4 py-3 text-sm text-secondary">
        This is optional, and only for <b className="text-fg">your customers&apos; laundry bills</b>, paid into your own Razorpay or Stripe
        account. Your Toss plan is paid on <a href="/admin/billing" className="text-accent hover:text-accent-2">Billing</a>, with no setup.
      </p>

      <Card title="How it works">
        <ul className="space-y-1.5 text-sm text-secondary">
          <li>✓ Customers tap <b className="text-fg">Pay</b> and pay on your gateway&apos;s page: UPI, cards, netbanking, wallets, Apple Pay…</li>
          <li>✓ The gateway tells Toss the moment the money arrives, with a signed message. The bill turns paid and the invoice goes out by itself.</li>
          <li>✓ Nobody types a reference, and nothing a customer does in their browser can mark a bill paid.</li>
          <li>✓ The money goes straight to your account. The gateway charges its own fee per payment; Toss charges nothing.</li>
          <li>
            Once connected, customers pay only this way (or cash). Your {tenant.currency === "INR" ? "UPI ID" : "other payment details"} stop showing on bills.
          </li>
        </ul>
      </Card>

      {!ready ? (
        <Card>
          <p className="text-sm text-secondary">Online payments switch on after the next database update.</p>
        </Card>
      ) : connected ? (
        <Card
          title="Connected"
          action={
            <Badge tone={connected.live ? "good" : "warn"} icon="●">
              {connected.live ? "Live" : "Test mode"}
            </Badge>
          }
        >
          <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Gateway</dt>
            <dd>
              {name(connected.provider as string)}
              {connected.key_id ? <span className="ml-2 font-mono text-xs text-muted">{connected.key_id as string}</span> : null}
            </dd>
            <dt className="text-muted">Connected</dt>
            <dd>{fmt.dateTime(connected.connected_at as string)}</dd>
            <dt className="text-muted">Last message</dt>
            <dd>{connected.last_event_at ? fmt.dateTime(connected.last_event_at as string) : "None yet. It appears after the first payment."}</dd>
          </dl>
          {!connected.live && (
            <p className="mt-4 rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
              Test mode: payments are pretend. Try one from a customer account, then connect your live keys.
            </p>
          )}
          {noHook && (
            <details className="mt-5 rounded-[8px] border border-border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-fg">Add a webhook (optional)</summary>
              <p className="mt-2 mb-4 text-xs text-muted">
                Optional, makes it instant: without a webhook, Toss asks Razorpay about each payment when the customer comes back
                  or the dashboard is opened. With one, it&apos;s confirmed the second it&apos;s paid.
              </p>
              <GatewayForm suggested="razorpay" pendingRazorpay={{ webhookUrl: webhookUrl("razorpay", noHook.webhook_token as string), live: noHook.live === true }} />
            </details>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4">
            <details className="text-sm">
              <summary className="cursor-pointer text-accent">Change keys</summary>
              <div className="mt-4">
                <GatewayForm suggested={connected.provider as "razorpay" | "stripe"} />
              </div>
            </details>
            <ConfirmButton
              action={disconnectGateway}
              fields={{}}
              label="Disconnect"
              confirm="Disconnect? Customers go back to paying the way they did before (and you confirm payments yourself)."
            />
          </div>
        </Card>
      ) : (
        <Card title="Connect your gateway">
          <GatewayForm suggested={tenant.currency === "INR" ? "razorpay" : "stripe"} />
          <p className="mt-4 text-xs text-muted">
            Don&apos;t have an account? Sign up free at {tenant.currency === "INR" ? "razorpay.com (business PAN and a bank account needed to go live)" : "stripe.com"}.
            Test mode works straight away.
          </p>
        </Card>
      )}
    </div>
  );
}
