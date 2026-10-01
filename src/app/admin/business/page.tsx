import type { Metadata } from "next";
import { ChangePasswordCard } from "@/components/change-password";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { IdChip } from "@/components/id-chip";
import { Card, PageTitle, StatTile } from "@/components/ui";
import { updateBusiness, updateWinback } from "@/lib/actions/manager";
import { getOfferStats, getTenantById, listCustomers } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Business" };

export default async function Business({ searchParams }: PageProps<"/admin/business">) {
  const session = await requireRole("MANAGER");
  const [tenant, customers, params] = await Promise.all([getTenantById(session.tenantId), listCustomers(), searchParams]);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const mine = customers.filter((c) => c.tenantId === tenant.id);
  const offers = await getOfferStats(tenant.id);

  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker="Your business">{tenant.name}</PageTitle>

      {params.welcome && (
        <p role="status" className="rounded-xl border border-good/30 bg-good-bg px-4 py-3 text-sm text-good">
          🎉 Your business is live. Share your Business ID with customers so they can connect to you.
        </p>
      )}

      <Card title="Share with your customers">
        <div className="flex flex-wrap items-center gap-6">
          <IdChip label="Business ID" value={tenant.joinCode} />
          <p className="max-w-sm text-sm text-secondary">
            Customers enter this after signing up on Toss. Their baskets, pickups and invoices then show up here, and their
            payments go to your UPI ID.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <StatTile label="Connected customers" value={String(mine.length)} />
        <StatTile label="Price per kg" value={`₹${tenant.pricePerKg}`} />
      </div>

      <Card title="Business details">
        <ActionForm action={updateBusiness} submitLabel="Save changes">
          <Field label="Business name">
            <input name="name" required minLength={2} maxLength={80} defaultValue={tenant.name} className={fieldClass} />
          </Field>
          <Field label="Price per kg (₹)" hint="Applies to new pickups. Existing invoices keep their amount (edit them under Payments).">
            <input name="price" type="number" required min={1} max={10000} step="1" defaultValue={tenant.pricePerKg} className={fieldClass} />
          </Field>
          <Field label="UPI ID for customer payments" hint="Where customers' money goes. Change it anytime; unpaid invoices use the new ID.">
            <input name="upiId" required autoComplete="off" defaultValue={tenant.upiId ?? ""} placeholder="yourshop@okaxis" className={`${fieldClass} font-mono`} />
          </Field>
          <Field
            label="Store address (where drivers deliver)"
            hint={
              tenant.storeAddress
                ? tenant.storeLocated
                  ? "✓ Found on the map. Every driver route ends here."
                  : "Not found on the map. Routes will search it by text; adding area and city helps."
                : "Every driver's Google Maps route ends at this address."
            }
          >
            <input name="storeAddress" maxLength={300} defaultValue={tenant.storeAddress ?? ""} placeholder="Shop 4, Lajpat Nagar Market, New Delhi" className={fieldClass} />
          </Field>
          <Field label="Name shown in UPI apps">
            <input name="upiName" maxLength={50} defaultValue={tenant.upiName ?? ""} placeholder={tenant.name} className={fieldClass} />
          </Field>
        </ActionForm>
      </Card>
      <Card title="🎁 Win back quiet customers">
        <p className="mb-4 text-sm text-secondary">
          When a customer hasn&apos;t had a pickup for a while, Toss sends them a discount in the Toss bot and on their dashboard. It&apos;s
          applied to their next pickup automatically, valid for 14 days.
          {offers.sent > 0 && (
            <span className="text-fg">
              {" "}
              So far: {offers.sent} sent, {offers.redeemed} came back.
            </span>
          )}
        </p>
        <ActionForm action={updateWinback} submitLabel="Save offer" className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={tenant.winbackEnabled} className="size-4 accent-[var(--color-accent)]" />
            Send win-back offers
          </label>
          <Field label="After this many days without a pickup">
            <input name="days" type="number" min={7} max={365} step={1} required defaultValue={tenant.winbackDays} className={fieldClass} />
          </Field>
          <Field label="Discount on their next pickup (%)">
            <input name="pct" type="number" min={1} max={50} step={1} required defaultValue={tenant.winbackPct} className={fieldClass} />
          </Field>
        </ActionForm>
      </Card>

      <ChangePasswordCard email={session.email} />
    </div>
  );
}
