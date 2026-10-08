import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Card, PageTitle } from "@/components/ui";
import { updateWinback } from "@/lib/actions/manager";
import { getOfferStats, getTenantById } from "@/lib/data";
import { planState, tierOf } from "@/lib/plan";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Win-back offers" };

// Settings → Win-back offers (Pro): an automatic discount for customers who stopped ordering.
export default async function Winback() {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const pro = tierOf(planState(tenant).state) === "PRO";
  const offers = await getOfferStats(tenant.id);

  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker={pro ? "Settings" : "Settings · Pro"}>Win-back offers</PageTitle>
      <BackLink />

      <Card title="Win back quiet customers" action={!pro ? <Link href="/admin/billing" className="font-mono text-[10px] text-accent">PRO · UPGRADE →</Link> : undefined}>
        <p className="mb-4 text-sm text-secondary">
          When a customer hasn&apos;t had a pickup for a while, Toss sends them a discount in the Toss Control bot and on their dashboard. It&apos;s
          applied to their next pickup automatically, valid for 14 days.
          {!pro && <span className="text-warn"> Paused on Toss Free: offers go out again when you upgrade.</span>}
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

    </div>
  );
}
