import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { PasswordField } from "@/components/password-field";
import { Card, PageTitle } from "@/components/ui";
import { updatePayments } from "@/lib/actions/manager";
import { getTenantById } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Price & UPI" };

// Settings → Price & UPI: what customers pay and where the money goes. Saving needs the account password.
export default async function PaymentsSettings() {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;

  return (
    <div className="stagger max-w-2xl space-y-6">
      <PageTitle kicker="Settings · protected">Price &amp; UPI</PageTitle>
      <BackLink />
      <Card title="What customers pay, and where it goes">
        <ActionForm action={updatePayments} submitLabel="Save with password">
          <Field label="Price per kg (₹)" hint="Applies to new pickups. Existing bills keep their amount (edit them under Payments).">
            <input name="price" type="number" required min={1} max={10000} step="1" defaultValue={tenant.pricePerKg} className={fieldClass} />
          </Field>
          <Field label="UPI ID for customer payments" hint="Where customers' money goes. Unpaid bills use the new ID straight away.">
            <input name="upiId" required autoComplete="off" defaultValue={tenant.upiId ?? ""} placeholder="yourshop@okaxis" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Name shown in UPI apps">
            <input name="upiName" maxLength={50} defaultValue={tenant.upiName ?? ""} placeholder={tenant.name} className={fieldClass} />
          </Field>
          <PasswordField />
        </ActionForm>
      </Card>
    </div>
  );
}
