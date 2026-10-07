import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { proGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { monthLabel, statements } from "@/lib/accounts";
import { deleteAccount, saveAccount, setBasketAccount, settleMonth } from "@/lib/actions/accounts";
import { deviceLabel, getTenantById, listAccounts, listDevices, listOrders } from "@/lib/data";
import { formatINR, formatKg } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Business account" };

// One business account: its details and price, its baskets, and its monthly bills (download, send on WhatsApp,
// mark paid).
export default async function Account({ params }: PageProps<"/admin/accounts/[id]">) {
  const locked = await proGate("Business accounts", "Put a PG or hostel's baskets on one account and bill them once a month.");
  if (locked) return locked;

  const { id: raw } = await params;
  const id = raw.includes("%") ? decodeURIComponent(raw) : raw;
  const session = await getSession();
  const [tenant, accounts, devices, orders] = await Promise.all([getTenantById(session?.tenantId), listAccounts(), listDevices(), listOrders({ status: "COMPLETED" })]);
  const account = accounts.find((a) => a.id === id);
  if (!account || !tenant) notFound(); // RLS: other businesses' accounts don't exist here

  const baskets = devices.filter((d) => d.accountId === account.id);
  const free = devices.filter((d) => !d.accountId);
  const bills = statements(orders.filter((o) => o.accountId === account.id));
  const price = account.pricePerKg ?? tenant.pricePerKg;

  const whatsapp = (b: (typeof bills)[number]) =>
    account.phone
      ? `https://wa.me/${account.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
          `Hello ${account.contactName ?? account.name}, your ${monthLabel(b.month)} laundry bill from ${tenant.name}: ` +
            `${b.pickups} pickup${b.pickups === 1 ? "" : "s"}, ${formatKg(b.kg)} at ₹${price}/kg = ${formatINR(b.amount)}.` +
            (b.unpaid > 0 ? ` Due: ${formatINR(b.unpaid)}.${tenant.upiId ? ` Pay by UPI to ${tenant.upiId}.` : ""}` : " Paid in full, thank you!"),
        )}`
      : undefined;

  return (
    <div className="stagger max-w-5xl space-y-6">
      <PageTitle kicker={`Business account · ${account.id}`}>{account.name}</PageTitle>
      <Link href="/admin/accounts" className="text-sm text-accent hover:text-accent-2">
        ← All accounts
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Baskets on this account">
          {baskets.length === 0 ? (
            <EmptyState>No baskets yet. Add the account&apos;s baskets below; their new pickups go on this bill.</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {baskets.map((d) => (
                <li key={d.deviceId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <span>
                    <span className="font-medium text-fg">{deviceLabel(d)}</span>
                    <span className="block font-mono text-xs text-muted">{d.deviceId}</span>
                  </span>
                  <form action={setBasketAccount}>
                    <input type="hidden" name="deviceId" value={d.deviceId} />
                    <input type="hidden" name="accountId" value="" />
                    <button className="text-xs text-muted underline hover:text-critical">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {free.length > 0 && (
            <form action={setBasketAccount} className="mt-4 flex gap-2 border-t border-border pt-4">
              <input type="hidden" name="accountId" value={account.id} />
              <label className="sr-only" htmlFor="deviceId">
                Basket to add
              </label>
              <select id="deviceId" name="deviceId" required className="flex-1 rounded-[8px] border border-border bg-surface-solid px-3 py-2 text-sm">
                {free.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d)}
                  </option>
                ))}
              </select>
              <button className="btn-primary rounded-full px-4 py-2 text-sm font-medium">Add basket</button>
            </form>
          )}
          <p className="mt-3 text-xs text-muted">Pickups from these baskets are priced at {formatINR(price)}/kg and billed monthly; customers aren&apos;t asked to pay each pickup.</p>
        </Card>

        <Card title="Details">
          <ActionForm action={saveAccount} submitLabel="Save">
            <input type="hidden" name="id" value={account.id} />
            <Field label="Name">
              <input name="name" required minLength={2} maxLength={80} defaultValue={account.name} className={fieldClass} />
            </Field>
            <Field label="Price per kg (₹)" hint={`Empty: your normal ${formatINR(tenant.pricePerKg)}/kg.`}>
              <input name="pricePerKg" type="number" min={1} step="any" defaultValue={account.pricePerKg ?? ""} className={fieldClass} />
            </Field>
            <Field label="Contact person">
              <input name="contactName" maxLength={80} defaultValue={account.contactName ?? ""} className={fieldClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile" hint="For sending bills on WhatsApp.">
                <input name="phone" type="tel" inputMode="tel" defaultValue={account.phone ? formatPhone(account.phone) : ""} className={fieldClass} />
              </Field>
              <Field label="Email">
                <input name="email" type="email" defaultValue={account.email ?? ""} className={fieldClass} />
              </Field>
            </div>
          </ActionForm>
          <div className="mt-4 border-t border-border pt-4">
            <ConfirmButton
              action={deleteAccount}
              fields={{ id: account.id }}
              label="Delete account"
              confirm="Delete this account? Its baskets keep working and past pickups stay; new pickups are billed normally."
            />
          </div>
        </Card>
      </div>

      <Card title="Monthly bills">
        {bills.length === 0 ? (
          <EmptyState>Bills appear here once the account&apos;s baskets have completed pickups.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {bills.map((b) => {
              const wa = whatsapp(b);
              return (
                <li key={b.month} className="grid gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{monthLabel(b.month)}</span>
                      {b.unpaid > 0 ? <Badge tone="warn">{formatINR(b.unpaid)} due</Badge> : <Badge tone="good">Paid</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted tabular-nums">
                      {b.pickups} pickup{b.pickups === 1 ? "" : "s"} · {formatKg(b.kg)} · <span className="text-fg">{formatINR(b.amount)}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      <a href={`/admin/accounts/${encodeURIComponent(account.id)}/statement?month=${b.month}`} className="text-accent hover:text-accent-2">
                        Download Excel
                      </a>
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-2">
                          Send on WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                  {b.unpaid > 0 && (
                    <ActionForm action={settleMonth} submitLabel={`Mark ${formatINR(b.unpaid)} paid`} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="accountId" value={account.id} />
                      <input type="hidden" name="month" value={b.month} />
                      <label className="sr-only" htmlFor={`method-${b.month}`}>
                        Paid by
                      </label>
                      <select id={`method-${b.month}`} name="method" defaultValue="UPI" className="rounded-[8px] border border-border bg-surface-solid px-3 py-2 text-sm">
                        <option value="UPI">UPI</option>
                        <option value="CASH">Cash</option>
                        <option value="OTHER">Bank / other</option>
                      </select>
                      <label className="sr-only" htmlFor={`ref-${b.month}`}>
                        Reference
                      </label>
                      <input id={`ref-${b.month}`} name="ref" placeholder="UPI reference" maxLength={40} className="w-40 rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2 text-sm" />
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
