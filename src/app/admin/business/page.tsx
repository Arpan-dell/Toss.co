import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { IdChip } from "@/components/id-chip";
import { Card, PageTitle, StatTile } from "@/components/ui";
import { updateBusiness } from "@/lib/actions/manager";
import { getTenantById, listCustomers } from "@/lib/data";
import { requireRole } from "@/lib/session";
import { ServiceAreaEditor } from "./area-editor";

export const metadata: Metadata = { title: "Business" };

// Settings → Business: who you are and where you are. Price & UPI, how you work, and the account have their own pages.
export default async function Business({ searchParams }: PageProps<"/admin/business">) {
  const session = await requireRole("MANAGER");
  const [tenant, customers, params] = await Promise.all([getTenantById(session.tenantId), listCustomers(), searchParams]);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const mine = customers.filter((c) => c.tenantId === tenant.id);

  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker="Your business">{tenant.name}</PageTitle>
      <BackLink />

      {params.welcome && (
        <p role="status" className="rounded-[8px] border border-good/30 bg-good-bg px-4 py-3 text-sm text-good">
          Your business is live. Share your Business ID with customers so they can connect to you.
        </p>
      )}

      <Card title="Share with your customers">
        <div className="flex flex-wrap items-center gap-6">
          <IdChip label="Business ID" value={tenant.joinCode} />
          <p className="max-w-sm text-sm text-secondary">
            Customers enter this after signing up on Toss. Their baskets, pickups and invoices then show up here, and their payments go to your UPI ID.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <StatTile label="Connected customers" value={String(mine.length)} />
        <StatTile label="Price per kg" value={`₹${tenant.pricePerKg}`} hint="Change it under Price & UPI" />
      </div>

      <Card title="Business details">
        <ActionForm action={updateBusiness} submitLabel="Save changes">
          <Field label="Business name">
            <input name="name" required minLength={2} maxLength={80} defaultValue={tenant.name} className={fieldClass} />
          </Field>
          <Field
            label="Store address (where drivers bring the laundry)"
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
        </ActionForm>
        <p className="mt-3 text-xs text-muted">
          Price and UPI ID are under{" "}
          <Link href="/admin/settings/payments" className="text-accent hover:text-accent-2">
            Settings → Price &amp; UPI
          </Link>
          , protected by your password.
        </p>
      </Card>

      <Card title="Service area">
        <p className="mb-4 text-sm text-secondary">
          Where you pick up from. Toss lists you for customers inside this circle in <span className="text-fg">Find a laundry</span>, on the website and
          in Telegram.
        </p>
        <ServiceAreaEditor lat={tenant.storeLat} lng={tenant.storeLng} radiusKm={tenant.serviceRadiusKm} listed={tenant.listed} />
      </Card>
    </div>
  );
}
