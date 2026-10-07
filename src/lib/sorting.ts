// Whites and coloured clothes (migration 0025). When a laundry sorts at pickup, the driver packs two tagged bags
// and weighs each; the order keeps both weights. Pure helpers shared by the driver bot, the manager pages, the
// customer's message and the invoice.

export type Bags = { whitesKg?: number | null; colouredKg?: number | null };

export const isSorted = (o: Bags) => o.whitesKg != null || o.colouredKg != null;

/** What the driver writes on each bag, e.g. #104-W and #104-C. */
export const bagTag = (orderNo: number | string, kind: "WHITES" | "COLOURED") => `#${orderNo}-${kind === "WHITES" ? "W" : "C"}`;

const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;

/** "Whites 2.1 kg · Coloured 3.4 kg" (a bag with nothing in it is left out); "" when the order wasn't sorted. */
export function bagsLine(o: Bags, emoji = false): string {
  if (!isSorted(o)) return "";
  const parts: string[] = [];
  if ((o.whitesKg ?? 0) > 0) parts.push(`${emoji ? "⚪ " : ""}Whites ${kg(o.whitesKg!)}`);
  if ((o.colouredKg ?? 0) > 0) parts.push(`${emoji ? "🎨 " : ""}Coloured ${kg(o.colouredKg!)}`);
  return parts.join(" · ");
}

/** Both bags weighed: the billed weight, or null if both were empty (at least one bag must have clothes). */
export function sortedTotal(whitesKg: number, colouredKg: number): number | null {
  const total = Math.round((whitesKg + colouredKg) * 100) / 100;
  return total > 0 ? total : null;
}

export type WashQueue = { whites: number; coloured: number; unsorted: number; orders: number };

/** Clothes picked up and not ready yet, by kind: what the laundry has to wash. */
export function washQueue(orders: (Bags & { status: string; readyAt?: string; weightKg: number })[]): WashQueue {
  const q: WashQueue = { whites: 0, coloured: 0, unsorted: 0, orders: 0 };
  for (const o of orders) {
    if (o.status !== "COMPLETED" || o.readyAt) continue;
    q.orders += 1;
    if (isSorted(o)) {
      q.whites += o.whitesKg ?? 0;
      q.coloured += o.colouredKg ?? 0;
    } else q.unsorted += o.weightKg || 0;
  }
  const r = (n: number) => Math.round(n * 10) / 10;
  return { whites: r(q.whites), coloured: r(q.coloured), unsorted: r(q.unsorted), orders: q.orders };
}
