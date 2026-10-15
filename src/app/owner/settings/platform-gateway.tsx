import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card } from "@/components/ui";
import { connectPlatformGateway, disconnectPlatformGateway } from "@/lib/actions/gateway";
import { platformToken, webhookUrl } from "@/lib/gateway-payments";
import { formatDateTime } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GatewayForm } from "../../admin/settings/online-payments/gateway-form";

const GROUPS = [
  { group: "INR" as const, title: "Rupees (businesses in India)", suggested: "razorpay" as const, note: "UPI, cards, netbanking and wallets. The payment page shows a UPI QR code too." },
  { group: "USD" as const, title: "US dollars (businesses abroad)", suggested: "stripe" as const, note: "Cards, Apple Pay and Google Pay. Razorpay works too if international payments are on for your account." },
];

// Owner → Plan & payments: Toss's own gateway for subscriptions. Businesses tap Pay, the gateway confirms the
// payment to Toss, and the plan extends by itself: no references to type, nothing to approve.
export async function PlatformGatewayCard() {
  const { data, error } = await supabaseAdmin().from("platform_gateways").select("currency_group, provider, key_id, live, webhook_secret_enc, connected_at, last_event_at");
  return (
    <Card title="Subscription payments">
      <p className="mb-4 text-sm text-secondary">
        Businesses pay their plan on your gateway&apos;s page, and it&apos;s confirmed to Toss automatically. The money goes to your gateway account.
      </p>
      {error ? (
        <p className="rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
          Run the 0036 database update (Supabase → SQL Editor) to connect a gateway here.
        </p>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const row = data?.find((r) => r.currency_group === g.group);
            const connected = row ?? null;
            // Razorpay works with the keys alone; a webhook (optional) makes confirmation instant
            const noHook = row && !row.webhook_secret_enc && row.provider === "razorpay" ? row : null;
            return (
              <section key={g.group} className="space-y-3 border-t border-border pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-fg">{g.title}</h3>
                  {connected ? (
                    <Badge tone={connected.live ? "good" : "warn"} icon="●">
                      {connected.provider === "razorpay" ? "Razorpay" : "Stripe"} · {connected.live ? "live" : "test mode"}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Not connected</Badge>
                  )}
                </div>
                <p className="text-xs text-muted">{g.note}</p>
                {noHook && (
                  <details className="rounded-[8px] border border-border px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-fg">Add a webhook (optional)</summary>
                    <p className="mt-2 mb-4 text-xs text-muted">
                      Optional, makes it instant: without a webhook, Toss asks Razorpay about each payment when the customer comes back
                  or the dashboard is opened. With one, it&apos;s confirmed the second it&apos;s paid.
                    </p>
                    <GatewayForm
                      suggested="razorpay"
                      action={connectPlatformGateway}
                      hidden={{ group: g.group }}
                      pendingRazorpay={{ webhookUrl: webhookUrl("razorpay", platformToken(g.group)), live: noHook.live === true }}
                    />
                  </details>
                )}
                {connected ? (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-secondary">
                    <span>
                      Connected {formatDateTime(connected.connected_at as string)}
                      {connected.last_event_at ? ` · last payment message ${formatDateTime(connected.last_event_at as string)}` : ""}
                    </span>
                    <ConfirmButton
                      action={disconnectPlatformGateway}
                      fields={{ group: g.group }}
                      label="Disconnect"
                      confirm="Disconnect? Businesses can't pay their plan online until you connect again."
                    />
                  </div>
                ) : (
                  <GatewayForm suggested={g.suggested} action={connectPlatformGateway} hidden={{ group: g.group }} />
                )}
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
