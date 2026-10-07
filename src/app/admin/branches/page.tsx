import { BackLink } from "@/components/back-link";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { Badge, Card, PageTitle, StatTile } from "@/components/ui";
import { addBranch, switchBranch } from "@/lib/actions/branches";
import { listMyBranches } from "@/lib/branches";
import { getPlatformSettings, now } from "@/lib/data";
import { formatINR, formatKg } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Branches" };

type Stats = { pickups: number; kg: number; collected: number; due: number; open: number; late: number; online: number };
const empty = (): Stats => ({ pickups: 0, kg: 0, collected: 0, due: 0, open: 0, late: 0, online: 0 });

// All of a manager's laundries on one screen (Pro on the main business): the last 30 days per branch and in total,
// with a switch into any branch. Reads use the service role, limited to tenants this manager runs.
export default async function Branches() {
  const session = await requireRole("MANAGER");
  const [branches, platform] = await Promise.all([listMyBranches(session.userId), getPlatformSettings()]);
  const main = branches.find((b) => b.main);

  if (!main || main.tier !== "PRO") {
    return (
      <div className="stagger space-y-6">
        <PageTitle kicker="Pro">Branches</PageTitle>
        <BackLink />
        <Card title="Branches are a Pro feature">
          <div className="space-y-4 text-sm text-secondary">
            <p>
              Run several laundries from one login: see every branch&apos;s pickups, money and late orders side by side, and switch between them in a tap.
              Each extra branch has its own Business ID, drivers and baskets, and its Pro plan costs {formatINR(platform.branchPrice)}/month instead of{" "}
              {formatINR(platform.monthlyPrice)}.
            </p>
            <Link href="/admin/billing" className="btn-primary inline-flex rounded-full px-5 py-2.5 text-sm font-medium">
              Upgrade to Pro →
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const ids = branches.map((b) => b.id);
  const since = new Date(now().getTime() - 30 * 86_400_000).toISOString();
  const db = supabaseAdmin();
  const [{ data: orders }, { data: open }, { data: drivers }] = await Promise.all([
    db.from("orders").select("tenant_id, status, payment_status, amount_due, weight_kg, ready_by, ready_at").in("tenant_id", ids).gte("placed_at", since).limit(20_000),
    db.from("orders").select("tenant_id, status, ready_by, ready_at").in("tenant_id", ids).or("status.in.(PENDING,ACCEPTED),and(status.eq.COMPLETED,ready_at.is.null)").limit(5_000),
    db.from("drivers").select("tenant_id, status").in("tenant_id", ids).neq("status", "OFFLINE"),
  ]);

  const stats = new Map(ids.map((id) => [id, empty()]));
  const t = now().getTime();
  for (const o of orders ?? []) {
    const s = stats.get(o.tenant_id as string)!;
    if (o.status === "COMPLETED") {
      s.pickups += 1;
      s.kg += Number(o.weight_kg) || 0;
      if (o.payment_status === "PAID") s.collected += Number(o.amount_due) || 0;
      else if (o.payment_status !== "REFUNDED") s.due += Number(o.amount_due) || 0;
    }
  }
  for (const o of open ?? []) {
    const s = stats.get(o.tenant_id as string)!;
    if (o.status === "PENDING" || o.status === "ACCEPTED") s.open += 1;
    else if (o.ready_by && new Date(o.ready_by as string).getTime() < t) s.late += 1;
  }
  for (const d of drivers ?? []) stats.get(d.tenant_id as string)!.online += 1;

  const total = [...stats.values()].reduce(
    (a, s) => ({ pickups: a.pickups + s.pickups, kg: a.kg + s.kg, collected: a.collected + s.collected, due: a.due + s.due, open: a.open + s.open, late: a.late + s.late, online: a.online + s.online }),
    empty(),
  );

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker={`Pro · ${branches.length} branch${branches.length === 1 ? "" : "es"} · last 30 days`}>Branches</PageTitle>
      <BackLink />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pickups" value={String(total.pickups)} hint={formatKg(Math.round(total.kg * 10) / 10)} />
        <StatTile label="Collected" value={formatINR(Math.round(total.collected))} />
        <StatTile label="To collect" value={formatINR(Math.round(total.due))} />
        <StatTile label="Open now" value={String(total.open)} hint={total.late ? `${total.late} late` : `${total.online} drivers online`} />
      </div>

      <Card title="By branch">
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                <th className="px-2 py-2 font-normal">Branch</th>
                <th className="px-2 py-2 text-right font-normal">Pickups</th>
                <th className="px-2 py-2 text-right font-normal">Collected</th>
                <th className="px-2 py-2 text-right font-normal">To collect</th>
                <th className="px-2 py-2 text-right font-normal">Open</th>
                <th className="px-2 py-2 text-right font-normal">Late</th>
                <th className="px-2 py-2 text-right font-normal">Drivers on</th>
                <th className="px-2 py-2 font-normal">
                  <span className="sr-only">Switch</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branches.map((b) => {
                const s = stats.get(b.id)!;
                const current = b.id === session.tenantId;
                return (
                  <tr key={b.id}>
                    <td className="px-2 py-2.5">
                      <span className="font-medium text-fg">{b.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-mono">{b.joinCode}</span>
                        {b.main && <Badge tone="neutral">Main</Badge>}
                        <Badge tone={b.tier === "PRO" ? "good" : b.tier === "FREE" ? "info" : "critical"}>{b.tier === "PRO" ? "Pro" : b.tier === "FREE" ? "Free" : "Suspended"}</Badge>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {s.pickups}
                      <span className="block text-xs text-muted">{formatKg(Math.round(s.kg * 10) / 10)}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatINR(Math.round(s.collected))}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatINR(Math.round(s.due))}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{s.open}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums ${s.late ? "font-semibold text-critical" : ""}`}>{s.late}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{s.online}</td>
                    <td className="px-2 py-2.5 text-right">
                      {current ? (
                        <span className="text-xs text-muted">You&apos;re here</span>
                      ) : (
                        <form action={switchBranch}>
                          <input type="hidden" name="tenantId" value={b.id} />
                          <button className="btn-ghost rounded-full px-3 py-1 text-xs text-fg">Open →</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Add a branch" className="max-w-xl">
        <p className="mb-4 text-sm text-secondary">
          A new branch gets its own Business ID for customers, its own drivers and baskets, and starts on Toss Free with your price and UPI. Pro for a branch is{" "}
          <span className="font-medium text-fg">{formatINR(platform.branchPrice)}/month</span> (your main business pays {formatINR(platform.monthlyPrice)}): open the branch,
          then Billing.
        </p>
        <ActionForm action={addBranch} submitLabel="Add branch">
          <Field label="Branch name">
            <input name="name" required minLength={2} maxLength={80} placeholder="Fresh Laundry, Sector 21" className={fieldClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
