import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, fieldClass } from "@/components/action-form";
import { ChangePasswordCard, YourDataCard } from "@/components/change-password";
import { IdChip } from "@/components/id-chip";
import { JoinBusiness } from "@/components/join-business";
import { Badge, Card, PageTitle } from "@/components/ui";
import { savePrefs, updatePhone } from "@/lib/actions/customer";
import { deviceLabel, getCustomer, getCustomerPrefs, getDeviceForCustomer, getTenantById } from "@/lib/data";
import { PREF_KEYS, PREF_OPTIONS } from "@/lib/prefs";
import { formatPhone } from "@/lib/phone";
import { requireRole } from "@/lib/session";
import { getTelegramOidcConfig } from "@/lib/telegram-oidc";
import { getT } from "@/lib/i18n/server";

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
  const t = await getT();
  const [customer, device, params] = await Promise.all([
    getCustomer(session.userId),
    getDeviceForCustomer(session.userId),
    searchParams,
  ]);
  const result = typeof params.telegram === "string" ? RESULTS[params.telegram] : undefined;
  const [business, prefs] = await Promise.all([getTenantById(customer?.tenantId), getCustomerPrefs(session.userId)]);
  const telegramReady = getTelegramOidcConfig() !== null;

  return (
    <div className="stagger mx-auto w-full max-w-2xl space-y-6">
      <PageTitle kicker={t("Account")}>{t("Settings")}</PageTitle>

      {result && (
        <p role="status" className={`rounded-[8px] border px-4 py-3 text-sm ${toneClass[result.tone]}`}>
          {t(result.text)}
        </p>
      )}

      <Card title={t("Laundry preferences")}>
        <p className="mb-4 text-sm text-secondary">{t("How you like your clothes done. Your laundry sees this with every pickup.")}</p>
        <ActionForm action={savePrefs} submitLabel={t("Save preferences")}>
          {PREF_KEYS.map((k) => (
            <fieldset key={k}>
              <legend className="mb-1.5 text-sm text-secondary">{t(PREF_OPTIONS[k].label)}</legend>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-sm text-secondary has-[:checked]:border-accent/60 has-[:checked]:bg-accent/15 has-[:checked]:text-accent">
                  <input type="radio" name={k} value="" defaultChecked={!prefs[k]} className="sr-only" />
                  {t("No preference")}
                </label>
                {Object.entries(PREF_OPTIONS[k].options).map(([v, label]) => (
                  <label
                    key={v}
                    className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-sm text-secondary has-[:checked]:border-accent/60 has-[:checked]:bg-accent/15 has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                  >
                    <input type="radio" name={k} value={v} defaultChecked={prefs[k] === v} className="sr-only" />
                    {t(label)}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <label className="block text-sm text-secondary">
            {t("Anything else? (optional)")}
            <textarea name="notes" maxLength={200} rows={2} defaultValue={prefs.notes ?? ""} placeholder={t("e.g. wash the red shirt separately")} className={`${fieldClass} mt-1.5`} />
          </label>
        </ActionForm>
      </Card>

      <Card title={t("Account")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">{t("Name")}</dt>
            <dd>{customer?.name ?? "—"}</dd>
            <dt className="text-muted">{t("Email")}</dt>
            <dd>{customer?.email ?? session.email}</dd>
            <dt className="text-muted">{t("Mobile")}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {customer?.phone ? formatPhone(customer.phone) : <span className="text-warn">{t("Not added")}</span>}
              {customer?.phoneVerified && <Badge tone="good" icon="✓">{t("Verified by Telegram")}</Badge>}
            </dd>
          </dl>
          {customer && <IdChip label={t("Customer ID")} value={customer.customerCode} />}
        </div>
        <details className="mt-4 text-sm" open={!customer?.phone}>
          <summary className="cursor-pointer text-xs text-muted">{t(customer?.phone ? "Change mobile number" : "Add your mobile number")}</summary>
          <ActionForm action={updatePhone} submitLabel={t("Save number")} className="mt-3 flex max-w-md flex-wrap items-start gap-2">
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
          <p className="mt-2 text-xs text-muted">{t("Your laundry finds you by this number. Linking Telegram marks it verified.")}</p>
        </details>
      </Card>

      <ChangePasswordCard email={customer?.email ?? session.email} />
      <YourDataCard />

      <Card title={t("Your laundry")} action={business ? <Badge tone="good" icon="✓">{t("Connected")}</Badge> : <Badge tone="warn" icon="!">{t("Not connected")}</Badge>}>
        {business ? (
          <div className="space-y-4 text-sm">
            <p>
              {t("You're a customer of {business} (Business ID {id}). Your pickups are billed at ₹{price}/kg.", {
                business: business.name,
                id: business.joinCode,
                price: business.pricePerKg,
              })}
            </p>
            <details className="text-secondary">
              <summary className="cursor-pointer text-xs text-muted">{t("Switch to a different laundry")}</summary>
              <div className="mt-3 max-w-md">
                <JoinBusiness compact />
                <p className="mt-2 text-xs text-muted">{t("Past orders stay with the laundry that handled them.")}</p>
              </div>
            </details>
          </div>
        ) : (
          <div className="max-w-md space-y-3 text-sm text-secondary">
            <p>{t("Enter your laundry's Business ID to connect your account to it.")}</p>
            <JoinBusiness compact />
          </div>
        )}
      </Card>

      <Card
        title="Telegram"
        action={
          customer?.telegramId ? <Badge tone="good" icon="✓">{t("Linked")}</Badge> : <Badge tone="warn" icon="!">{t("Not linked")}</Badge>
        }
      >
        {customer?.telegramId ? (
          <p className="text-sm text-secondary">
            {t("Linked to Telegram ID {id}. Orders from the basket you claimed in Telegram show up here automatically.", { id: customer.telegramId })}
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              {t(
                "The easiest way: open the Toss Control bot in Telegram and tap 📱 Open Toss. Your account links itself. Or log in with Telegram below and share your number to verify it. Use the Telegram account that claimed your basket, and your past and future orders will appear here.",
              )}
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
                {t("Log in with Telegram")}
              </a>
            ) : (
              <p className="text-xs text-muted">{t("Telegram linking isn't set up on this server yet.")}</p>
            )}
          </div>
        )}
      </Card>

      <Card title={t("Basket")}>
        {device ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">{t("Basket")}</dt>
            <dd>{deviceLabel(device)}</dd>
            <dt className="text-muted">{t("Device ID")}</dt>
            <dd className="font-mono">{device.deviceId}</dd>
            {device.targetKg !== undefined && (
              <>
                <dt className="text-muted">{t("Target weight")}</dt>
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
            {t("No basket linked yet. It appears here once your Telegram account is linked and the basket places an order.")}
          </p>
        )}
      </Card>
      {!business && (
        <Card title={t("Run a laundry business?")}>
          <p className="text-sm text-secondary">
            {t("Register your business on Toss to manage pickups, drivers and payments. You get a free trial.")}
          </p>
          <Link href="/app/register-business" className="btn-ghost mt-4 inline-flex rounded-full px-4 py-2 text-sm">
            {t("Register my business")} →
          </Link>
        </Card>
      )}
    </div>
  );
}
