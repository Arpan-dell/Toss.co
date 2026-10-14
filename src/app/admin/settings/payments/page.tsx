import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { Card, PageTitle } from "@/components/ui";
import { getTenantById } from "@/lib/data";
import { formatterFor, regionOf } from "@/lib/region-format";
import { countryOf } from "@/lib/regions";
import { requireRole } from "@/lib/session";
import { PaymentsForm } from "./payments-form";

export const metadata: Metadata = { title: "Price & payments" };

// Settings → Price & payments: where the business is, what customers pay, and where the money goes. Saving needs
// the account password.
export default async function PaymentsSettings() {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const region = regionOf(tenant);
  const fmt = formatterFor(region);

  return (
    <div className="stagger mx-auto w-full max-w-2xl space-y-6">
      <PageTitle kicker="Settings · protected">Price &amp; payments</PageTitle>
      <BackLink />
      <Card title="What customers pay, and where it goes">
        <PaymentsForm
          v={{
            country: region.country,
            currency: region.currency,
            timezone: region.timezone,
            unit: region.unit,
            price: fmt.ratePerUnit(tenant.pricePerKg),
            minOrder: tenant.minOrder,
            taxLabel: tenant.taxLabel ?? countryOf(region.country).tax,
            taxPct: tenant.taxPct,
            taxId: tenant.taxId ?? "",
            upiId: tenant.upiId ?? "",
            upiName: tenant.upiName ?? "",
            name: tenant.name,
            methods: tenant.payMethods,
            regionReady: tenant.regionReady === true,
          }}
        />
      </Card>
    </div>
  );
}
