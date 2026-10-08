import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Card, PageTitle } from "@/components/ui";
import { updateDelivers } from "@/lib/actions/delivery";
import { updateWeighing } from "@/lib/actions/manager";
import { updateService } from "@/lib/actions/service";
import { getTenantById } from "@/lib/data";
import { planState, tierOf } from "@/lib/plan";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "How you work" };

// Settings → How you work: weighing and sorting at pickup, delivery back, and the turnaround you promise.
export default async function Operations() {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const pro = tierOf(planState(tenant).state) === "PRO";

  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker="Settings">How you work</PageTitle>
      <BackLink />

      <Card title="Weight at pickup">
        <ActionForm action={updateWeighing} submitLabel="Save">
          <label className="flex items-start gap-2.5 text-sm">
            <input name="weighAtPickup" type="checkbox" defaultChecked={tenant.weighAtPickup} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium text-fg">Driver weighs every bag at pickup</span>
              <span className="mt-0.5 block text-secondary">
                After <b>Picked up</b>, the driver bot asks for the scale reading and bills that weight. The basket&apos;s reading is
                kept beside it, so a basket that under-reports shows up on the order page. A driver without a scale can still use the
                basket&apos;s reading; that order is marked <i>not weighed</i>.
              </span>
              <span className="mt-1 block text-xs text-muted">Off: pickups bill the basket&apos;s reading straight away. You can still confirm any unpaid order&apos;s weight on its page.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 border-t border-dotted border-border-strong pt-3 text-sm">
            <input name="sortWhites" type="checkbox" defaultChecked={tenant.sortWhites} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium text-fg">Keep whites and coloured clothes apart</span><span className="ml-1.5 rounded-[4px] bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-accent">PRO</span>
              <span className="mt-0.5 block text-secondary">
                At pickup the driver packs <b>whites</b> and <b>coloured clothes</b> in two bags, tags them (like <code>#104-W</code> and{" "}
                <code>#104-C</code>) and weighs each one. Your live board then shows how many kg of each are waiting to be washed, and supplies like
                bleach can come off the whites only.
              </span>
              <span className="mt-1 block text-xs text-muted">
                Needs weighing at pickup. The price per kg is the same for both bags.
                {!pro && " On Toss Free drivers use one bag; upgrade to turn sorting on."}
              </span>
            </span>
          </label>
        </ActionForm>
      </Card>

      <Card title="Delivery back to customers">
        <ActionForm action={updateDelivers} submitLabel="Save">
          <label className="flex items-start gap-2.5 text-sm">
            <input name="delivers" type="checkbox" defaultChecked={tenant.delivers} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium text-fg">Deliver clean clothes back with our drivers</span>
              <span className="mt-0.5 block text-secondary">
                When you tap <b>Mark ready</b>, the order goes to the nearest online driver: they collect the bags from the store and take them back.
              </span>
              <span className="mt-1 block text-secondary">
                <span className="font-medium text-fg">With Pro</span>
                {" "}the customer gets a 4-digit code and reads it to the driver at the door, so you know it reached the right person, and
                drivers can record cash collected for unpaid orders.
                {!pro && (
                  <Link href="/admin/billing" className="ml-1 text-accent hover:text-accent-2">
                    Upgrade →
                  </Link>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted">Off: customers are told to collect ready orders at your store.</span>
            </span>
          </label>
        </ActionForm>
      </Card>

      <Card title="Turnaround and reviews">
        <ActionForm action={updateService} submitLabel="Save">
          <Field label="Ready within (hours)" hint="From pickup. Late orders show on your live board; tap Mark ready to tell the customer.">
            <input name="turnaroundHours" type="number" min={1} max={720} step={1} required defaultValue={tenant.turnaroundHours} className={fieldClass} />
          </Field>
          <Field label="Google review link (optional)" hint="Customers who rate you 4 or 5 stars are asked to post it on Google.">
            <input name="googleReviewUrl" type="url" defaultValue={tenant.googleReviewUrl ?? ""} placeholder="https://g.page/r/…/review" className={fieldClass} />
          </Field>
        </ActionForm>
      </Card>

    </div>
  );
}
