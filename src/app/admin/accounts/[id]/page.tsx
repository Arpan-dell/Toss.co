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
import { formatPhone } from "@/lib/phone";
import { getSession } from "@/lib/session";
import { myFormat } from "@/lib/my-format";
import { saveRoundSettings } from "@/lib/actions/bookings";
import { getRound } from "@/lib/bookings";
import { isVirtualDevice } from "@/lib/rounds";
import { listActiveOrders } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { Tr } from "@/components/locale";
export const metadata: Metadata = { title: "Business account" };

// One business account: its details and price, its baskets, and its monthly bills (download, send on WhatsApp,
// mark paid).
export default async function Account({ params }: PageProps<"/admin/accounts/[id]">) {
  const fmt = await myFormat();
  const locked = await proGate("Business accounts", "Put a PG or hostel's baskets on one account and bill them once a month.");
  if (locked) return locked;

  const { id: raw } = await params;
  const id = raw.includes("%") ? decodeURIComponent(raw) : raw;
  const session = await getSession();
  const [tenant, accounts, devices, orders] = await Promise.all([getTenantById(session?.tenantId), listAccounts(), listDevices(), listOrders({ status: "COMPLETED" })]);
  const account = accounts.find((a) => a.id === id);
  if (!account || !tenant) notFound(); // RLS: other businesses' accounts don't exist here

  const baskets = devices.filter((d) => d.accountId === account.id);
  const free = devices.filter((d) => !d.accountId && !isVirtualDevice(d.deviceId));
  // collection rounds (migration 0042): settings, residents, and the bags signed up for the next one
  const [round, active] = await Promise.all([getRound(account.id, tenant.id), listActiveOrders()]);
  const { data: residents } = round ? await supabaseAdmin().from("customers").select("id, name, room").eq("account_id", account.id).order("room") : { data: null };
  const nextBags = active.filter((o) => o.roundAccountId === account.id);
  const bills = statements(orders.filter((o) => o.accountId === account.id));
  const price = account.pricePerKg ?? tenant.pricePerKg;

  const whatsapp = (b: (typeof bills)[number]) =>
    account.phone
      ? `https://wa.me/${account.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
          `Hello ${account.contactName ?? account.name}, your ${monthLabel(b.month)} laundry bill from ${tenant.name}: ` +
            `${b.pickups} pickup${b.pickups === 1 ? "" : "s"}, ${fmt.weight(b.kg)} at ₹${price}/kg = ${fmt.money(b.amount)}.` +
            (b.unpaid > 0 ? ` Due: ${fmt.money(b.unpaid)}.${tenant.upiId ? ` Pay by UPI to ${tenant.upiId}.` : ""}` : " Paid in full, thank you!"),
        )}`
      : undefined;

  return (
    <div className="stagger mx-auto w-full max-w-5xl space-y-6">
      <PageTitle kicker={`Business account · ${account.id}`}>{account.name}</PageTitle>
      <Link href="/admin/accounts" className="text-sm text-accent hover:text-accent-2">
        <Tr>{"← All accounts"}</Tr>
      </Link>

      <Card title="Collection rounds" action={round?.everyDays ? <Badge tone="good">Every {round.everyDays === 1 ? "day" : `${round.everyDays} days`}</Badge> : undefined}>
        {!round ? (
          <EmptyState><Tr>{"Run the 0042 database update (Supabase → SQL Editor) to set up collection rounds."}</Tr></EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <ActionForm action={saveRoundSettings} submitLabel="Save rounds">
              <input type="hidden" name="accountId" value={account.id} />
              <p className="text-sm text-secondary">
                <Tr>{"A driver comes every few days at a set time. Residents tap"}</Tr> <b className="text-fg"><Tr>{"I have clothes this time"}</Tr></b> in Toss before it;
                the driver collects every bag as one stop and weighs each one. Hostels with a round at the <b className="text-fg"><Tr>{"same time"}</Tr></b> <Tr>{"go to one driver as a single trip, nearest next, while the bags fit (up to 20)."}</Tr>
              </p>
              <Field label="Address of the hostel or PG">
                <input name="address" defaultValue={round.address === account.name ? "" : round.address} maxLength={300} className={fieldClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="How often">
                  <select name="everyDays" defaultValue={String(round.everyDays)} className={fieldClass}>
                    <option value="0">{"Off"}</option>
                    {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "Every day" : `Every ${n} days`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="At">
                  <input name="time" type="time" defaultValue={round.time} className={fieldClass} />
                </Field>
                <Field label="Sign-ups close">
                  <select name="cutoff" defaultValue={String(round.cutoffMinutes)} className={fieldClass}>
                    {[
                      [0, "At the round"],
                      [30, "30 min before"],
                      [60, "1 hour before"],
                      [120, "2 hours before"],
                      [180, "3 hours before"],
                      [720, "12 hours before"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Who pays">
                <select name="billing" defaultValue={round.billing} className={fieldClass}>
                  <option value="account">The hostel: on this account&apos;s monthly bill</option>
                  <option value="resident">{"Each resident pays for their own bag"}</option>
                </select>
              </Field>
            </ActionForm>

            <div className="space-y-4 text-sm">
              <p className="text-secondary">
                {round.nextAt ? (
                  <>
                    Next collection: <span className="font-semibold text-fg">{fmt.dateTime(round.nextAt)}</span>
                  </>
                ) : (
                  "No collection scheduled. Choose how often and save."
                )}
              </p>
              <div>
                <p className="mb-1.5 font-medium">Bags signed up ({nextBags.length})</p>
                {nextBags.length === 0 ? (
                  <p className="text-muted"><Tr>{"None yet."}</Tr></p>
                ) : (
                  <ul className="divide-y divide-border">
                    {nextBags.map((o) => (
                      <li key={o.id} className="flex justify-between gap-3 py-1.5">
                        <span>{o.address}</span>
                        <span className="text-muted">{o.status === "ACCEPTED" ? "with the driver" : "waiting"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1.5 font-medium">Residents on Toss ({residents?.length ?? 0})</p>
                <p className="text-muted">
                  Residents pick this hostel and their room in their Toss account (share your Business ID, {tenant.joinCode}). Drivers can also add a
                  bag for anyone at the door.
                </p>
                {residents && residents.length > 0 && (
                  <p className="mt-1.5 text-secondary">
                    {residents
                      .slice(0, 40)
                      .map((r) => [r.room ? `Room ${r.room}` : null, r.name].filter(Boolean).join(" · ") || "Resident")
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

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
                    <button className="text-xs text-muted underline hover:text-critical"><Tr>{"Remove"}</Tr></button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {free.length > 0 && (
            <form action={setBasketAccount} className="mt-4 flex gap-2 border-t border-border pt-4">
              <input type="hidden" name="accountId" value={account.id} />
              <label className="sr-only" htmlFor="deviceId">
                <Tr>{"Basket to add"}</Tr>
              </label>
              <select id="deviceId" name="deviceId" required className="flex-1 rounded-[8px] border border-border bg-surface-solid px-3 py-2 text-sm">
                {free.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d)}
                  </option>
                ))}
              </select>
              <button className="btn-primary rounded-full px-4 py-2 text-sm font-medium"><Tr>{"Add basket"}</Tr></button>
            </form>
          )}
          <p className="mt-3 text-xs text-muted">Pickups from these baskets are priced at {fmt.money(price)}/kg and billed monthly; customers aren&apos;t asked to pay each pickup.</p>
        </Card>

        <Card title="Details">
          <ActionForm action={saveAccount} submitLabel="Save">
            <input type="hidden" name="id" value={account.id} />
            <Field label="Name">
              <input name="name" required minLength={2} maxLength={80} defaultValue={account.name} className={fieldClass} />
            </Field>
            <Field label="Price per kg (₹)" hint={`Empty: your normal ${fmt.money(tenant.pricePerKg)}/kg.`}>
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
                      {b.unpaid > 0 ? <Badge tone="warn">{fmt.money(b.unpaid)} due</Badge> : <Badge tone="good"><Tr>{"Paid"}</Tr></Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted tabular-nums">
                      {b.pickups} pickup{b.pickups === 1 ? "" : "s"} · {fmt.weight(b.kg)} · <span className="text-fg">{fmt.money(b.amount)}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      <a href={`/admin/accounts/${encodeURIComponent(account.id)}/statement?month=${b.month}`} className="text-accent hover:text-accent-2">
                        <Tr>{"Download Excel"}</Tr>
                      </a>
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-2">
                          <Tr>{"Send on WhatsApp"}</Tr>
                        </a>
                      )}
                    </div>
                  </div>
                  {b.unpaid > 0 && (
                    <ActionForm action={settleMonth} submitLabel={`Mark ${fmt.money(b.unpaid)} paid`} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="accountId" value={account.id} />
                      <input type="hidden" name="month" value={b.month} />
                      <label className="sr-only" htmlFor={`method-${b.month}`}>
                        <Tr>{"Paid by"}</Tr>
                      </label>
                      <select id={`method-${b.month}`} name="method" defaultValue="UPI" className="rounded-[8px] border border-border bg-surface-solid px-3 py-2 text-sm">
                        <option value="UPI">{"UPI"}</option>
                        <option value="CASH">{"Cash"}</option>
                        <option value="OTHER">{"Bank / other"}</option>
                      </select>
                      <label className="sr-only" htmlFor={`ref-${b.month}`}>
                        <Tr>{"Reference"}</Tr>
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
