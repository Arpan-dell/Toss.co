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

import { Tr } from "@/components/locale";
export const metadata: Metadata = { title: "How you work" };

// Settings → How you work: weighing and sorting at pickup, delivery back, and the turnaround you promise.
export default async function Operations() {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const pro = tierOf(planState(tenant).state) === "PRO";

  return (
    <div className="stagger mx-auto w-full max-w-3xl space-y-6">
      <PageTitle kicker="Settings"><Tr>{"How you work"}</Tr></PageTitle>
      <BackLink />

      <Card title="Where clothes are weighed">
        <ActionForm action={updateWeighing} submitLabel="Save">
          <fieldset className="space-y-3">
            <legend className="sr-only"><Tr>{"Where clothes are weighed"}</Tr></legend>
            {[
              {
                value: "door",
                title: "At the door, by the driver",
                body: "After Picked up, the driver bot asks for the scale reading and bills that weight. The basket's reading is kept beside it, so a basket that under-reports shows up on the order page.",
              },
              {
                value: "store",
                title: "At the store",
                body: "Drivers just collect. Bags wait under “To weigh at the store” on your live board; enter each weight there and the customer gets the bill. Orders can't be marked ready until they're weighed.",
              },
              {
                value: "basket",
                title: "The basket's reading",
                body: "Pickups bill what the basket weighed straight away. Pickups booked without a basket are weighed at the store.",
              },
            ].map((o) => (
              <label key={o.value} className="flex items-start gap-2.5 text-sm">
                <input type="radio" name="weighAt" value={o.value} defaultChecked={tenant.weighAt === o.value} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>
                  <span className="font-medium text-fg">{o.title}</span>
                  <span className="mt-0.5 block text-secondary">{o.body}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-muted">Whichever you choose, you can confirm or correct any unpaid order&apos;s weight on its page.</p>
          </fieldset>
          <label className="flex items-start gap-2.5 border-t border-dotted border-border-strong pt-3 text-sm">
            <input name="sortWhites" type="checkbox" defaultChecked={tenant.sortWhites} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium text-fg"><Tr>{"Keep whites and coloured clothes apart"}</Tr></span><span className="ml-1.5 rounded-[4px] bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-accent"><Tr>{"PRO"}</Tr></span>
              <span className="mt-0.5 block text-secondary">
                <Tr>{"At pickup the driver packs"}</Tr> <b><Tr>{"whites"}</Tr></b> <Tr>{"and"}</Tr> <b><Tr>{"coloured clothes"}</Tr></b> <Tr>{"in two bags, tags them (like"}</Tr> <code>#104-W</code> and{" "}
                <code>#104-C</code>) and weighs each one. Your live board then shows how many kg of each are waiting to be washed, and supplies like
                bleach can come off the whites only.
              </span>
              <span className="mt-1 block text-xs text-muted">
                Needs weighing at the door. The price per kg is the same for both bags.
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
              <span className="font-medium text-fg"><Tr>{"Deliver clean clothes back with our drivers"}</Tr></span>
              <span className="mt-0.5 block text-secondary">
                <Tr>{"When you tap"}</Tr> <b><Tr>{"Mark ready"}</Tr></b>, the order goes to the nearest online driver: they collect the bags from the store and take them back.
              </span>
              <span className="mt-1 block text-secondary">
                <span className="font-medium text-fg"><Tr>{"With Pro"}</Tr></span>
                {" "}the customer gets a 4-digit code and reads it to the driver at the door, so you know it reached the right person, and
                drivers can record cash collected for unpaid orders.
                {!pro && (
                  <Link href="/admin/billing" className="ml-1 text-accent hover:text-accent-2">
                    <Tr>{"Upgrade →"}</Tr>
                  </Link>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted"><Tr>{"Off: customers are told to collect ready orders at your store."}</Tr></span>
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
