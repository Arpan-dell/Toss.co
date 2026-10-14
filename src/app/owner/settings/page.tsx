import { PasswordField } from "@/components/password-field";
import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { ChangePasswordCard } from "@/components/change-password";
import { Card, PageTitle } from "@/components/ui";
import { updatePlatformSettings } from "@/lib/actions/owner";
import { getPlatformSettings } from "@/lib/data";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Plan & payments" };

export default async function OwnerSettings() {
  const session = await requireRole("OWNER");
  const s = await getPlatformSettings();
  return (
    <div className="stagger mx-auto w-full max-w-xl space-y-6">
      <PageTitle kicker="Toss platform">Plan &amp; payments</PageTitle>
      <Card title="Subscription for laundry businesses">
        <ActionForm action={updatePlatformSettings} submitLabel="Save settings">
          <Field label="Monthly price (₹)">
            <input name="monthlyPrice" type="number" min={0} step="1" required defaultValue={s.monthlyPrice} className={fieldClass} />
          </Field>
          <Field label="Extra branch price (₹/month)" hint="What each additional branch of a business pays for Pro.">
            <input name="branchPrice" type="number" min={0} step="1" required defaultValue={s.branchPrice} className={fieldClass} />
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
          <fieldset className="space-y-3 rounded-[10px] border border-border p-3">
            <legend className="px-1 text-xs font-medium text-secondary">Businesses outside India (paid in US dollars)</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly price (US$)">
                <input name="usdMonthlyPrice" type="number" min={0} step="0.01" required defaultValue={s.usdMonthlyPrice} className={fieldClass} />
              </Field>
              <Field label="Extra branch (US$/month)">
                <input name="usdBranchPrice" type="number" min={0} step="0.01" required defaultValue={s.usdBranchPrice} className={fieldClass} />
              </Field>
            </div>
            <Field label="Your PayPal.me username" hint="They pay through paypal.me/yourname with the amount filled in. Free to set up; PayPal charges a fee per payment.">
              <input name="ownerPaypal" autoComplete="off" defaultValue={s.ownerPaypal ?? ""} placeholder="tosslaundry" className={fieldClass} />
            </Field>
            <Field label="Or another payment link (optional)" hint="A Wise, Payoneer or Stripe payment page, for paying by card or bank.">
              <input name="ownerIntlLink" type="url" defaultValue={s.ownerIntlLink ?? ""} placeholder="https://wise.com/pay/me/…" className={fieldClass} />
            </Field>
          </fieldset>
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
          <PasswordField hint="Your UPI ID and PayPal receive every subscription, so changes need your password." />
        </ActionForm>
      </Card>
      <ChangePasswordCard email={session.email} />
    </div>
  );
}
