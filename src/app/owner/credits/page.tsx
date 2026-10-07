import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { grantBasketCredit, updateCreditSettings } from "@/lib/actions/owner";
import { getPlatformSettings, listCreditGrants } from "@/lib/data";
import { formatDateTime, formatINR } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Basket credits" };

// Owner: hand out the credit that comes with a sold basket, and set how credit works. The credit comes off the
// customer's bills automatically (database trigger, migration 0020); this page only grants it and tunes it.
export default async function OwnerCredits() {
  await requireRole("OWNER");
  const [s, grants] = await Promise.all([getPlatformSettings(), listCreditGrants()]);
  const kgToUse = s.creditPerKg > 0 ? Math.ceil(s.basketCredit / s.creditPerKg) : null;

  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker="Toss baskets">Basket credits</PageTitle>

      <Card title="Add credit for a sold basket">
        <p className="mb-4 text-sm text-secondary">
          Each basket sells for <span className="text-fg">{formatINR(s.basketPrice)}</span> with{" "}
          <span className="text-fg">{formatINR(s.basketCredit)}</span> of laundry credit. It comes off the customer&apos;s pickups at{" "}
          {formatINR(s.creditPerKg)}/kg (at most {s.creditMaxPct}% of a bill){kgToUse ? `, so it lasts about ${kgToUse} kg` : ""}, and expires after{" "}
          {s.creditValidDays} days.
        </p>
        <ActionForm action={grantBasketCredit} submitLabel="Add credit">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer ID" hint="On their dashboard, like C-AB12CD.">
              <input name="customerCode" required pattern="[Cc]-[A-Za-z0-9]{6}" placeholder="C-AB12CD" autoComplete="off" className={`${fieldClass} font-mono uppercase`} />
            </Field>
            <Field label="Amount (₹)" hint={`Leave empty for ${formatINR(s.basketCredit)}.`}>
              <input name="amount" type="number" min={1} max={100000} step={1} placeholder={String(s.basketCredit)} className={fieldClass} />
            </Field>
          </div>
          <Field label="Basket (optional)" hint="Its device ID, for your records.">
            <input name="deviceId" maxLength={64} autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Note (optional)">
            <input name="note" maxLength={200} placeholder="Sold at Saket store, paid cash" className={fieldClass} />
          </Field>
        </ActionForm>
      </Card>

      <Card title="Latest credits">
        {grants.length === 0 ? (
          <EmptyState>No basket credit given yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  <span className="font-medium text-fg">{g.customerName ?? "Customer"}</span>{" "}
                  <span className="font-mono text-xs text-muted">{g.customerCode}</span>
                  {g.note && <span className="block text-xs text-muted">{g.note}</span>}
                </span>
                <span className="text-right">
                  <span className="font-semibold text-fg">{formatINR(g.amount)}</span>
                  <span className="block text-xs text-muted">{formatDateTime(g.grantedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="How credit works">
        <ActionForm action={updateCreditSettings} submitLabel="Save credit settings">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Basket price (₹)">
              <input name="basketPrice" type="number" min={0} step={1} required defaultValue={s.basketPrice} className={fieldClass} />
            </Field>
            <Field label="Credit per basket (₹)">
              <input name="basketCredit" type="number" min={0} step={1} required defaultValue={s.basketCredit} className={fieldClass} />
            </Field>
            <Field label="Credit used per kg (₹)" hint="Taken off each pickup's bill.">
              <input name="creditPerKg" type="number" min={0} step="0.5" required defaultValue={s.creditPerKg} className={fieldClass} />
            </Field>
            <Field label="At most, of one bill (%)">
              <input name="creditMaxPct" type="number" min={0} max={100} step={1} required defaultValue={s.creditMaxPct} className={fieldClass} />
            </Field>
            <Field label="Toss pays back (%)" hint="Of the credit a laundry's customers use, as subscription discount.">
              <input name="creditTossSharePct" type="number" min={0} max={100} step={1} required defaultValue={s.creditTossSharePct} className={fieldClass} />
            </Field>
            <Field label="Covers at most (% of a subscription payment)">
              <input name="creditSubMaxPct" type="number" min={0} max={100} step={1} required defaultValue={s.creditSubMaxPct} className={fieldClass} />
            </Field>
            <Field label="Credit valid for (days)">
              <input name="creditValidDays" type="number" min={1} max={3650} step={1} required defaultValue={s.creditValidDays} className={fieldClass} />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
