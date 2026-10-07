// Monthly bills for business accounts (PGs, hostels, offices). Pure, so the statement page, the Excel statement
// and the settle action all group pickups the same way. Months are calendar months in India time (IST).
import type { Order } from "./types";

const IST = 330 * 60_000;

/** "2026-10" for a timestamp, in IST. */
export function monthKeyIST(iso: string): string {
  return new Date(new Date(iso).getTime() + IST).toISOString().slice(0, 7);
}

/** [start, end) of an IST month as ISO strings, or null if the key isn't YYYY-MM. */
export function monthRangeIST(key: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2020 || y > 2100) return null;
  return { start: new Date(Date.UTC(y, mo - 1, 1) - IST).toISOString(), end: new Date(Date.UTC(y, mo, 1) - IST).toISOString() };
}

/** "October 2026" */
export const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export interface Statement {
  month: string; // YYYY-MM
  pickups: number;
  kg: number;
  amount: number; // everything billed that month
  unpaid: number; // still to collect
  orders: Order[];
}

/** Completed pickups of one account, by month (newest first). Cancelled pickups are never billed. */
export function statements(orders: Order[]): Statement[] {
  const by = new Map<string, Statement>();
  for (const o of orders) {
    if (o.status !== "COMPLETED") continue;
    const month = monthKeyIST(o.completedAt ?? o.createdAt);
    const s = by.get(month) ?? { month, pickups: 0, kg: 0, amount: 0, unpaid: 0, orders: [] };
    s.pickups += 1;
    s.kg += o.weightKg || 0;
    s.amount += o.amountDue || 0;
    if (o.paymentStatus !== "PAID" && o.paymentStatus !== "REFUNDED") s.unpaid += o.amountDue || 0;
    s.orders.push(o);
    by.set(month, s);
  }
  return [...by.values()]
    .map((s) => ({ ...s, kg: Math.round(s.kg * 100) / 100, orders: s.orders.sort((a, b) => (a.completedAt ?? a.createdAt).localeCompare(b.completedAt ?? b.createdAt)) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
