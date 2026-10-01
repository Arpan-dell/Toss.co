import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { ChangePasswordCard } from "@/components/change-password";
import { Card, PageTitle } from "@/components/ui";
import { updatePlatformSettings } from "@/lib/actions/owner";
import { getPlatformSettings } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Plan & UPI" };

export default async function OwnerSettings() {
  const session = await requireRole("OWNER");
  const s = await getPlatformSettings();
  return (
    <div className="stagger max-w-xl space-y-6">
      <PageTitle kicker="Toss platform">Plan &amp; UPI</PageTitle>
      <Card title="Subscription for laundry businesses">
        <ActionForm action={updatePlatformSettings} submitLabel="Save settings">
          <Field label="Monthly price (₹)">
            <input name="monthlyPrice" type="number" min={0} step="1" required defaultValue={s.monthlyPrice} className={fieldClass} />
          </Field>
          <Field label="Free trial (days)" hint="Applies to businesses registered from now on.">
            <input name="trialDays" type="number" min={0} max={365} step="1" required defaultValue={s.trialDays} className={fieldClass} />
          </Field>
          <Field label="Your UPI ID" hint="Businesses pay their subscription here. You then approve each payment.">
            <input name="ownerUpiId" required autoComplete="off" defaultValue={s.ownerUpiId ?? ""} placeholder="you@okaxis" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Name shown in UPI apps">
            <input name="ownerUpiName" maxLength={50} defaultValue={s.ownerUpiName} className={fieldClass} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-secondary">Discount for paying several months at once (%)</legend>
            <div className="grid grid-cols-3 gap-3">
              <Field label="3–5 months">
                <input name="discount3m" type="number" min={0} max={90} step={1} required defaultValue={s.discount3m} className={fieldClass} />
              </Field>
              <Field label="6–11 months">
                <input name="discount6m" type="number" min={0} max={90} step={1} required defaultValue={s.discount6m} className={fieldClass} />
              </Field>
              <Field label="12 months">
                <input name="discount12m" type="number" min={0} max={90} step={1} required defaultValue={s.discount12m} className={fieldClass} />
              </Field>
            </div>
            <span className="block text-xs text-muted">Shown on every business&apos;s Billing page. 1 month is always full price.</span>
          </fieldset>
        </ActionForm>
      </Card>
      <ChangePasswordCard email={session.email} />
    </div>
  );
}
