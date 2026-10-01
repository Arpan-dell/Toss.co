import type { Order } from "./types";

// Deterministic aggregates for the Analytics charts. Toss AI (src/lib/ai) builds its own richer
// analysis and sends only aggregates (no names, addresses or chat IDs) to the language model.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const IST_OFFSET_MS = 330 * 60_000; // UTC+05:30, no daylight saving

export interface Aggregates {
  totalOrders: number;
  totalKg: number;
  byWeekday: { day: (typeof WEEKDAYS)[number]; orders: number; kg: number }[];
  byWeek: { weekStart: string; orders: number; kg: number }[];
  avgTurnaroundHrs: number;
}

export function computeAggregates(orders: Order[]): Aggregates {
  const byWeekday = WEEKDAYS.map((day) => ({ day, orders: 0, kg: 0 }));
  const weeks = new Map<string, { orders: number; kg: number }>();
  let turnaroundSum = 0;
  let turnaroundCount = 0;

  for (const o of orders) {
    const created = new Date(o.createdAt);
    // Bucket by India Standard Time regardless of the server's timezone (Vercel runs in UTC).
    const local = new Date(created.getTime() + IST_OFFSET_MS);
    const wd = byWeekday[local.getUTCDay()];
    wd.orders++;
    wd.kg += o.weightKg;

    const weekStart = new Date(local);
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)); // Monday
    const key = weekStart.toISOString().slice(0, 10);
    const w = weeks.get(key) ?? { orders: 0, kg: 0 };
    w.orders++;
    w.kg += o.weightKg;
    weeks.set(key, w);

    if (o.completedAt) {
      turnaroundSum += (new Date(o.completedAt).getTime() - created.getTime()) / 3_600_000;
      turnaroundCount++;
    }
  }

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    totalOrders: orders.length,
    totalKg: round(orders.reduce((s, o) => s + o.weightKg, 0)),
    byWeekday: byWeekday.map((d) => ({ ...d, kg: round(d.kg) })),
    byWeek: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({ weekStart, orders: v.orders, kg: round(v.kg) })),
    avgTurnaroundHrs: turnaroundCount ? round(turnaroundSum / turnaroundCount) : 0,
  };
}
