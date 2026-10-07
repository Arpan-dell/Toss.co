import { BackLink } from "@/components/back-link";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { proGate } from "@/components/plan-gate";
import { Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { monthKeyIST, statements } from "@/lib/accounts";
import { saveAccount } from "@/lib/actions/accounts";
import { getTenantById, listAccounts, listDevices, listOrders, now } from "@/lib/data";
import { formatINR, formatKg } from "@/lib/format";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Business accounts" };

// Business accounts (Pro): PGs, hostels and offices with several baskets, their own price per kg and one bill a
// month. Each account's page has its baskets and monthly bills.
export default async function Accounts() {
  const locked = await proGate(
    "Business accounts",
    "Win PGs, hostels and offices: put all their baskets on one account with its own price per kg, and send one bill a month instead of collecting every pickup.",
  );
  if (locked) return locked;

  const session = await getSession();
  const [tenant, accounts, devices, orders] = await Promise.all([getTenantById(session?.tenantId), listAccounts(), listDevices(), listOrders({ status: "COMPLETED" })]);
  const thisMonth = monthKeyIST(now().toISOString());

  const rows = accounts.map((a) => {
    const bills = statements(orders.filter((o) => o.accountId === a.id));
    const current = bills.find((b) => b.month === thisMonth);
    return {
      a,
      baskets: devices.filter((d) => d.accountId === a.id).length,
      month: current,
      unpaid: bills.reduce((s, b) => s + b.unpaid, 0),
    };
  });
  const unpaid = rows.reduce((s, r) => s + r.unpaid, 0);
  const monthAmount = rows.reduce((s, r) => s + (r.month?.amount ?? 0), 0);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Pro">Business accounts</PageTitle>
      <BackLink />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Accounts" value={String(accounts.length)} hint={`${rows.reduce((s, r) => s + r.baskets, 0)} baskets`} />
        <StatTile label="Billed this month" value={formatINR(monthAmount)} />
        <StatTile label="To collect" value={formatINR(unpaid)} hint="all months" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Accounts">
          {rows.length === 0 ? (
            <EmptyState>Add your first PG, hostel or office. Then put its baskets on the account.</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {rows.map(({ a, baskets, month, unpaid }) => (
                <li key={a.id}>
                  <Link href={`/admin/accounts/${encodeURIComponent(a.id)}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-accent">
                    <span>
                      <span className="font-medium text-fg">{a.name}</span>
                      <span className="block text-xs text-muted">
                        {baskets} basket{baskets === 1 ? "" : "s"} · {a.pricePerKg ? `${formatINR(a.pricePerKg)}/kg` : `your price (${formatINR(tenant?.pricePerKg ?? 0)}/kg)`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="font-semibold text-fg tabular-nums">{formatINR(month?.amount ?? 0)}</span>
                      <span className="block text-xs text-muted">
                        this month · {formatKg(month?.kg ?? 0)}
                        {unpaid > 0 ? ` · ${formatINR(unpaid)} due` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="New account">
          <ActionForm action={saveAccount} submitLabel="Add account">
            <Field label="Name">
              <input name="name" required minLength={2} maxLength={80} placeholder="Sunrise Boys PG" className={fieldClass} />
            </Field>
            <Field label="Price per kg (₹)" hint={`Leave empty for your normal ${formatINR(tenant?.pricePerKg ?? 0)}/kg.`}>
              <input name="pricePerKg" type="number" min={1} step="any" className={fieldClass} />
            </Field>
            <Field label="Contact person (optional)">
              <input name="contactName" maxLength={80} className={fieldClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile (optional)">
                <input name="phone" type="tel" inputMode="tel" autoComplete="off" className={fieldClass} />
              </Field>
              <Field label="Email (optional)">
                <input name="email" type="email" autoComplete="off" className={fieldClass} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
