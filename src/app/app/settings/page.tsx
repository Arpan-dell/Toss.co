import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, fieldClass } from "@/components/action-form";
import { ChangePasswordCard } from "@/components/change-password";
import { IdChip } from "@/components/id-chip";
import { JoinBusiness } from "@/components/join-business";
import { Badge, Card, PageTitle } from "@/components/ui";
import { updatePhone } from "@/lib/actions/customer";
import { deviceLabel, getCustomer, getDeviceForCustomer, getTenantById } from "@/lib/data";
import { formatPhone } from "@/lib/phone";
import { requireRole } from "@/lib/session";
import { getTelegramOidcConfig } from "@/lib/telegram-oidc";

export const metadata: Metadata = { title: "Settings" };

const RESULTS: Record<string, { tone: "good" | "critical" | "warn"; text: string }> = {
  linked: { tone: "good", text: "Telegram linked. Orders from your basket now appear in your account." },
  taken: { tone: "critical", text: "That Telegram account is already linked to a different Toss account." },
  cancelled: { tone: "warn", text: "Telegram login was cancelled. Nothing was changed." },
  invalid: { tone: "critical", text: "We couldn't verify that Telegram login. Please try again." },
  "not-configured": { tone: "warn", text: "Telegram linking isn't set up on this server yet." },
  error: { tone: "critical", text: "Something went wrong while linking. Please try again." },
};

const toneClass = {
  good: "border-good/30 bg-good-bg text-good",
  critical: "border-critical/30 bg-critical-bg text-critical",
  warn: "border-warn/30 bg-warn-bg text-warn",
};

export default async function CustomerSettings({ searchParams }: PageProps<"/app/settings">) {
  const session = await requireRole("CUSTOMER");
  const [customer, device, params] = await Promise.all([
    getCustomer(session.userId),
    getDeviceForCustomer(session.userId),
    searchParams,
  ]);
  const result = typeof params.telegram === "string" ? RESULTS[params.telegram] : undefined;
  const business = await getTenantById(customer?.tenantId);
  const telegramReady = getTelegramOidcConfig() !== null;

  return (
    <div className="stagger max-w-2xl space-y-6">
      <PageTitle kicker="Account">Settings</PageTitle>

      {result && (
        <p role="status" className={`rounded-[8px] border px-4 py-3 text-sm ${toneClass[result.tone]}`}>
          {result.text}
        </p>
      )}

      <Card title="Account">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Name</dt>
            <dd>{customer?.name ?? "—"}</dd>
            <dt className="text-muted">Email</dt>
            <dd>{customer?.email ?? session.email}</dd>
            <dt className="text-muted">Mobile</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {customer?.phone ? formatPhone(customer.phone) : <span className="text-warn">Not added</span>}
              {customer?.phoneVerified && <Badge tone="good" icon="✓">Verified by Telegram</Badge>}
            </dd>
          </dl>
          {customer && <IdChip label="Customer ID" value={customer.customerCode} />}
        </div>
        <details className="mt-4 text-sm" open={!customer?.phone}>
          <summary className="cursor-pointer text-xs text-muted">{customer?.phone ? "Change mobile number" : "Add your mobile number"}</summary>
          <ActionForm action={updatePhone} submitLabel="Save number" className="mt-3 flex max-w-md flex-wrap items-start gap-2">
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={customer?.phone ? formatPhone(customer.phone) : ""}
              placeholder="98765 43210"
              required
              className={`${fieldClass} flex-1`}
            />
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Your laundry finds you by this number. Linking Telegram marks it verified.</p>
        </details>
      </Card>

      <ChangePasswordCard email={customer?.email ?? session.email} />

      <Card title="Your laundry" action={business ? <Badge tone="good" icon="✓">Connected</Badge> : <Badge tone="warn" icon="!">Not connected</Badge>}>
        {business ? (
          <div className="space-y-4 text-sm">
            <p>
              You&apos;re a customer of <span className="font-medium text-fg">{business.name}</span> (Business ID{" "}
              <span className="font-mono">{business.joinCode}</span>). Your pickups are billed at ₹{business.pricePerKg}/kg.
            </p>
            <details className="text-secondary">
              <summary className="cursor-pointer text-xs text-muted">Switch to a different laundry</summary>
              <div className="mt-3 max-w-md">
                <JoinBusiness compact />
                <p className="mt-2 text-xs text-muted">Past orders stay with the laundry that handled them.</p>
              </div>
            </details>
          </div>
        ) : (
          <div className="max-w-md space-y-3 text-sm text-secondary">
            <p>Enter your laundry&apos;s Business ID to connect your account to it.</p>
            <JoinBusiness compact />
          </div>
        )}
      </Card>

      <Card
        title="Telegram"
        action={
          customer?.telegramId ? <Badge tone="good" icon="✓">Linked</Badge> : <Badge tone="warn" icon="!">Not linked</Badge>
        }
      >
        {customer?.telegramId ? (
          <p className="text-sm text-secondary">
            Linked to Telegram ID <span className="font-mono text-fg">{customer.telegramId}</span>. Orders from the
            basket you claimed in Telegram show up here automatically.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              The easiest way: open the <span className="text-fg">Toss Control</span> bot in Telegram and tap <span className="text-fg">📱 Open Toss</span>. Your
              account links itself. Or log in with Telegram below and share your number to verify it. Use the Telegram
              account that claimed your basket, and your past and future orders will appear here.
            </p>
            {telegramReady ? (
              // Plain link, not <Link>: this must be a full navigation to the redirecting API route.
              <a
                href="/api/telegram/start"
                className="inline-flex items-center gap-2 rounded-full bg-[#2AABEE] px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_-8px_rgb(42_171_238/0.7)] transition hover:brightness-110"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                Log in with Telegram
              </a>
            ) : (
              <p className="text-xs text-muted">Telegram linking isn&apos;t set up on this server yet.</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Basket">
        {device ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Basket</dt>
            <dd>{deviceLabel(device)}</dd>
            <dt className="text-muted">Device ID</dt>
            <dd className="font-mono">{device.deviceId}</dd>
            {device.targetKg !== undefined && (
              <>
                <dt className="text-muted">Target weight</dt>
                <dd>{device.targetKg} kg</dd>
              </>
            )}
            {device.firmwareVersion && (
              <>
                <dt className="text-muted">Firmware</dt>
                <dd>{device.firmwareVersion}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted">
            No basket linked yet. It appears here once your Telegram account is linked and the basket places an order.
          </p>
        )}
      </Card>
      {!business && (
        <Card title="Run a laundry business?">
          <p className="text-sm text-secondary">
            Register your business on Toss to manage pickups, drivers and payments. You get a free trial.
          </p>
          <Link href="/app/register-business" className="btn-ghost mt-4 inline-flex rounded-full px-4 py-2 text-sm">
            Register my business →
          </Link>
        </Card>
      )}
    </div>
  );
}
