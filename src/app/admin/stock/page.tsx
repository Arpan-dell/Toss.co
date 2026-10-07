import type { Metadata } from "next";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { proGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { deleteSupply, restockSupply, saveSupply } from "@/lib/actions/supplies";
import { getTenantById, listOrders, listSupplies, now, type Supply } from "@/lib/data";
import { formatINR } from "@/lib/format";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Supplies" };

const UNITS: Supply["unit"][] = ["ml", "l", "g", "kg", "pcs"];
const qty = (n: number, unit: string) => `${Number.isInteger(Math.round(n * 10) / 10) ? Math.round(n) : (Math.round(n * 10) / 10).toFixed(1)} ${unit}`;

function SupplyFields({ s }: { s?: Supply }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Name">
          <input name="name" required maxLength={60} defaultValue={s?.name} placeholder="Detergent" className={fieldClass} />
        </Field>
        <Field label="Unit">
          <select name="unit" defaultValue={s?.unit ?? "ml"} className={fieldClass}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Used per kg washed" hint="Leave 0 if it's per order.">
          <input name="perKg" type="number" min={0} step="any" defaultValue={s?.perKg ?? 0} className={fieldClass} />
        </Field>
        <Field label="Used per order" hint="Like one bag per order.">
          <input name="perOrder" type="number" min={0} step="any" defaultValue={s?.perOrder ?? 0} className={fieldClass} />
        </Field>
        <Field label="Alert me below" hint="Email when stock drops under this.">
          <input name="lowAt" type="number" min={0} step="any" defaultValue={s?.lowAt ?? 0} className={fieldClass} />
        </Field>
        <Field label="Cost per unit (₹)" hint="For profit per order.">
          <input name="costPerUnit" type="number" min={0} step="any" defaultValue={s?.costPerUnit ?? 0} className={fieldClass} />
        </Field>
      </div>
      <Field label="Used for" hint="Whites only or coloured only needs drivers to bag them apart (Business page).">
        <select name="appliesTo" defaultValue={s?.appliesTo ?? "ALL"} className={fieldClass}>
          <option value="ALL">Every wash</option>
          <option value="WHITES">Whites only (like bleach)</option>
          <option value="COLOURED">Coloured only (like colour care)</option>
        </select>
      </Field>
      <Field label="Supplier's WhatsApp (optional)" hint="Adds a one-tap reorder button.">
        <input name="supplierPhone" type="tel" defaultValue={s?.supplierPhone ?? ""} placeholder="98765 43210" className={fieldClass} />
      </Field>
    </>
  );
}

// Supplies stock (Pro): what the laundry uses per kg or per order. Stock comes down by itself as pickups are
// completed (database trigger), with an estimate of how long it lasts at the last month's pace.
export default async function Stock() {
  const locked = await proGate("Supplies", "Stock that counts itself down as pickups are completed, a warning before you run out, and a one-tap reorder on WhatsApp.");
  if (locked) return locked;

  const session = await getSession();
  const [supplies, orders, tenant] = await Promise.all([listSupplies(), listOrders({ status: "COMPLETED" }), getTenantById(session?.tenantId)]);
  // pace: kg and orders completed in the last 30 days
  const since = now().getTime() - 30 * 86_400_000;
  const recent = orders.filter((o) => new Date(o.completedAt ?? o.createdAt).getTime() >= since);
  const kgPerDay = recent.reduce((a, o) => a + (o.weightKg || 0), 0) / 30;
  const ordersPerDay = recent.length / 30;
  // whites-only and coloured-only supplies go at that kind's pace
  const pace = {
    ALL: { kg: kgPerDay, orders: ordersPerDay },
    WHITES: { kg: recent.reduce((a, o) => a + (o.whitesKg ?? 0), 0) / 30, orders: recent.filter((o) => (o.whitesKg ?? 0) > 0).length / 30 },
    COLOURED: { kg: recent.reduce((a, o) => a + (o.colouredKg ?? 0), 0) / 30, orders: recent.filter((o) => (o.colouredKg ?? 0) > 0).length / 30 },
  };

  return (
    <div className="stagger max-w-4xl space-y-6">
      <PageTitle kicker="Pro">Supplies</PageTitle>

      <Card title="Stock">
        {supplies.length === 0 ? (
          <EmptyState>Add your detergent, softener and bags below. Stock then comes down with every completed pickup.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {supplies.map((s) => {
              const perDay = s.perKg * pace[s.appliesTo].kg + s.perOrder * pace[s.appliesTo].orders;
              const days = perDay > 0 ? Math.max(0, Math.floor(s.stock / perDay)) : null;
              const low = s.stock <= s.lowAt;
              const fill = s.lowAt > 0 ? Math.min(100, (s.stock / (s.lowAt * 4)) * 100) : 100;
              const wa = s.supplierPhone
                ? `https://wa.me/${s.supplierPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, please send more ${s.name} for ${tenant?.name ?? "our laundry"}. Thank you.`)}`
                : null;
              return (
                <li key={s.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-fg">
                        {s.name} {low && <Badge tone="critical">Low</Badge>}
                      </p>
                      <p className="text-xs text-muted">
                        {[s.perKg > 0 && `${qty(s.perKg, s.unit)} per kg`, s.perOrder > 0 && `${qty(s.perOrder, s.unit)} per order`].filter(Boolean).join(" + ")}
                        {s.costPerUnit > 0 && ` · ${formatINR(s.costPerUnit)}/${s.unit}`}
                        {s.appliesTo !== "ALL" && ` · ${s.appliesTo === "WHITES" ? "whites only" : "coloured only"}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold tabular-nums ${low ? "text-critical" : "text-fg"}`}>{qty(s.stock, s.unit)}</p>
                      <p className="text-xs text-muted">{days === null ? "No pickups in the last month" : days === 0 ? "Runs out today" : `Lasts about ${days} day${days === 1 ? "" : "s"}`}</p>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
                    <div className={`h-full rounded-full ${low ? "bg-critical" : "bg-accent"}`} style={{ width: `${Math.max(2, fill)}%` }} />
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <ActionForm action={restockSupply} submitLabel="Add stock" className="flex flex-wrap items-center gap-2" submitClassName="btn-ghost rounded-full px-4 py-2 text-sm font-medium text-fg disabled:opacity-70">
                      <input type="hidden" name="id" value={s.id} />
                      <input name="qty" type="number" min={0} step="any" required placeholder={`How much arrived (${s.unit})`} className={`${fieldClass} w-48`} />
                    </ActionForm>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="btn-ghost inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm text-fg">
                        <WhatsappLogo size={16} weight="fill" className="text-good" aria-hidden /> Reorder
                      </a>
                    )}
                    <details className="w-full sm:w-auto">
                      <summary className="cursor-pointer text-sm text-muted hover:text-fg">Edit</summary>
                      <div className="mt-3 space-y-3 sm:w-96">
                        <ActionForm action={saveSupply} submitLabel="Save">
                          <input type="hidden" name="id" value={s.id} />
                          <SupplyFields s={s} />
                        </ActionForm>
                        <form action={deleteSupply}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="text-xs text-critical hover:underline">Remove {s.name}</button>
                        </form>
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          Last 30 days: {Math.round(kgPerDay * 30)} kg over {recent.length} pickups. Estimates use that pace.
        </p>
      </Card>

      <Card title="Add a supply">
        <ActionForm action={saveSupply} submitLabel="Add supply">
          <SupplyFields />
          <Field label="Stock right now">
            <input name="stock" type="number" min={0} step="any" defaultValue={0} className={fieldClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
