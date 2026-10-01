// Toss AI analytics: the numbers a manager can rely on. Pure and deterministic. Every model here is
// simple enough to explain in one line, and each result carries how much data it stands on; the
// forecast is backtested against the last two weeks so its accuracy is measured, not claimed.

export interface InsightOrder {
  id: string;
  placedAt: string;
  assignedAt?: string;
  completedAt?: string;
  weightKg: number;
  amount: number;
  status: string;
  paymentStatus: string;
  paymentConfirmedAt?: string;
  customerId?: string;
  deviceId: string;
  driverId?: string;
  declinedBy: string[];
}

export interface InsightsInput {
  now: string;
  orders: InsightOrder[];
  customers: { id: string; code: string }[];
  devices: { deviceId: string; area?: string }[];
  drivers: { chatId?: string; name: string }[];
}

export type Segment = "Champions" | "Loyal" | "New" | "At risk" | "Lost";
export const SEGMENTS: Segment[] = ["Champions", "Loyal", "New", "At risk", "Lost"];

export interface CustomerInsight {
  code: string;
  segment: Segment;
  orders: number;
  revenue: number;
  sinceDays: number;
  usualGapDays?: number;
  risk: number; // 0-100 churn-risk score
  value12m: number; // projected 12-month revenue
}

export interface Insights {
  data: { orders: number; days: number; level: "low" | "medium" | "high" };
  forecast: {
    history: { date: string; actual: number }[]; // last 28 days
    next: { date: string; weekday: string; mid: number; lo: number; hi: number }[]; // next 14 days
    accuracyPct: number | null; // 100 - WAPE on a 14-day holdout
    coverage: { inside: number; of: number } | null; // holdout days inside the 80% range
    next30: { orders: number; revenue: number; revenueLo: number; revenueHi: number };
    trendPct: number; // weekly trend of the smoothed level
  };
  heatmap: { cells: number[][]; peak: { weekday: string; from: number; to: number; share: number } | null };
  customers: {
    segments: Record<Segment, number>;
    list: CustomerInsight[]; // most valuable at-risk first
    revenueAtRisk: number;
    retention30: number | null; // % of last month's customers who came back this month
    avgOrderValue: number;
  };
  money: {
    aging: { bucket: string; count: number; amount: number }[];
    outstanding: number;
    medianDaysToPay: number | null;
    collectionPct: number;
    expectedIn7Days: number;
    weeklyRevenue: { week: string; revenue: number }[]; // last 8 weeks
  };
  areas: { area: string; orders: number; revenue: number; growthPct: number | null; share: number }[];
  drivers: { name: string; pickups: number; medianMins: number | null; onTimePct: number | null; declines: number }[];
  anomalies: { date: string; weekday: string; actual: number; expected: number; direction: "spike" | "drop" }[];
}

const DAY = 86_400_000;
const IST = 330 * 60_000;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const t = (iso: string) => new Date(iso).getTime();
const istDate = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const istWd = (ms: number) => new Date(ms + IST).getUTCDay();
const istHour = (ms: number) => new Date(ms + IST).getUTCHours();
const r1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Daily order counts for the `days` IST calendar days ending yesterday (oldest first). */
function dailyCounts(orders: InsightOrder[], nowMs: number, days: number) {
  const today = istDate(nowMs);
  const keys = Array.from({ length: days }, (_, i) => istDate(nowMs - (days - i) * DAY));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const counts = new Array(days).fill(0);
  for (const o of orders) {
    const k = istDate(t(o.placedAt));
    if (k === today) continue;
    const i = idx.get(k);
    if (i !== undefined) counts[i]++;
  }
  return keys.map((date, i) => ({ date, wd: istWd(t(`${date}T12:00:00+05:30`)), n: counts[i] }));
}

/**
 * Weekday-seasonal model with a smoothed level and damped trend:
 *   season[wd] = mean(wd) / mean(all) over the fit window
 *   level      = exponentially smoothed de-seasonalised daily count (α = 0.3)
 *   trend      = least-squares slope of the de-seasonalised series over the last 28 days (damped)
 * The 80% range comes from the spread of one-step-ahead errors.
 */
function fitModel(series: { wd: number; n: number }[]) {
  const mean = series.reduce((s, d) => s + d.n, 0) / Math.max(series.length, 1);
  const wdSum = new Array(7).fill(0);
  const wdCnt = new Array(7).fill(0);
  for (const d of series) {
    wdSum[d.wd] += d.n;
    wdCnt[d.wd]++;
  }
  const season = wdSum.map((s, i) => (mean > 0 && wdCnt[i] ? s / wdCnt[i] / mean : 1));
  const des = series.map((d) => (season[d.wd] > 0.05 ? d.n / season[d.wd] : d.n));
  let level = des.slice(0, 7).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(7, des.length));
  const errors: number[] = [];
  for (const [i, x] of des.entries()) {
    if (i >= 7) errors.push(x - level);
    level = 0.3 * x + 0.7 * level;
  }
  const tail = des.slice(-28);
  const xm = (tail.length - 1) / 2;
  const ym = tail.reduce((a, b) => a + b, 0) / Math.max(tail.length, 1);
  const num = tail.reduce((s, y, i) => s + (i - xm) * (y - ym), 0);
  const den = tail.reduce((s, _, i) => s + (i - xm) ** 2, 0);
  const slope = den ? num / den : 0;
  const sd = errors.length > 3 ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length) : Math.sqrt(Math.max(level, 1));
  return {
    season,
    level,
    slope,
    sd,
    predict(h: number, wd: number) {
      const damped = slope * Math.min(h, 14) * 0.5;
      const base = Math.max(0, level + damped);
      const mid = base * season[wd];
      const spread = 1.28 * sd * Math.sqrt(1 + h / 14) * Math.max(season[wd], 0.3);
      return { mid, lo: Math.max(0, mid - spread), hi: mid + spread };
    },
  };
}

export function computeInsights(input: InsightsInput): Insights {
  const now = t(input.now);
  const live = input.orders.filter((o) => o.status !== "CANCELLED");
  const span = live.length ? Math.ceil((now - Math.min(...live.map((o) => t(o.placedAt)))) / DAY) : 0;
  const level: Insights["data"]["level"] = live.length >= 150 && span >= 42 ? "high" : live.length >= 30 && span >= 14 ? "medium" : "low";
  const inDays = (o: InsightOrder, from: number, to = 0) => t(o.placedAt) >= now - from * DAY && t(o.placedAt) < now - to * DAY;
  const aov = (() => {
    const recent = live.filter((o) => inDays(o, 60) && o.amount > 0);
    return recent.length ? recent.reduce((s, o) => s + o.amount, 0) / recent.length : 0;
  })();

  // ---------- forecast + backtest ----------
  const series = dailyCounts(live, now, 84);
  const model = fitModel(series.slice(-56));
  const next = Array.from({ length: 14 }, (_, i) => {
    const ms = now + (i + 1) * DAY;
    const p = model.predict(i + 1, istWd(ms));
    return { date: istDate(ms), weekday: WD[istWd(ms)], mid: r1(p.mid), lo: r1(p.lo), hi: r1(p.hi) };
  });
  let accuracyPct: number | null = null;
  let coverage: Insights["forecast"]["coverage"] = null;
  const train = series.slice(-70, -14);
  const hold = series.slice(-14);
  if (train.filter((d) => d.n > 0).length >= 14 && hold.reduce((s, d) => s + d.n, 0) >= 5) {
    const m = fitModel(train);
    let absErr = 0;
    let total = 0;
    let inside = 0;
    hold.forEach((d, i) => {
      const p = m.predict(i + 1, d.wd);
      absErr += Math.abs(d.n - p.mid);
      total += d.n;
      if (d.n >= Math.floor(p.lo) && d.n <= Math.ceil(p.hi)) inside++;
    });
    accuracyPct = Math.max(0, Math.round(100 - (absErr / total) * 100));
    coverage = { inside, of: hold.length };
  }
  const next30Orders = Array.from({ length: 30 }, (_, i) => model.predict(i + 1, istWd(now + (i + 1) * DAY)));
  const sumMid = next30Orders.reduce((s, p) => s + p.mid, 0);
  const band = 1.28 * model.sd * Math.sqrt(30); // spread of a 30-day total
  const forecast: Insights["forecast"] = {
    history: series.slice(-28).map((d) => ({ date: d.date, actual: d.n })),
    next,
    accuracyPct,
    coverage,
    next30: {
      orders: Math.round(sumMid),
      revenue: Math.round(sumMid * aov),
      revenueLo: Math.round(Math.max(0, sumMid - band) * aov),
      revenueHi: Math.round((sumMid + band) * aov),
    },
    trendPct: model.level > 0 ? Math.round(((model.slope * 7) / model.level) * 100) : 0,
  };

  // ---------- heatmap (last 8 weeks) ----------
  const cells = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const recent56 = live.filter((o) => inDays(o, 56));
  for (const o of recent56) cells[istWd(t(o.placedAt))][istHour(t(o.placedAt))]++;
  let peak: Insights["heatmap"]["peak"] = null;
  if (recent56.length >= 10) {
    let best = { wd: 0, h: 0, n: -1 };
    for (let wd = 0; wd < 7; wd++) for (let h = 0; h <= 21; h++) {
      const n = cells[wd][h] + cells[wd][h + 1] + cells[wd][h + 2];
      if (n > best.n) best = { wd, h, n };
    }
    peak = { weekday: WD[best.wd], from: best.h, to: best.h + 3, share: Math.round((best.n / recent56.length) * 100) };
  }

  // ---------- customers: RFM segments, churn risk, 12-month value ----------
  const byCustomer = new Map<string, InsightOrder[]>();
  for (const o of live) if (o.customerId) byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) ?? []), o]);
  const repeatGaps: number[] = [];
  for (const os of byCustomer.values()) {
    const ts = os.map((o) => t(o.placedAt)).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) repeatGaps.push((ts[i] - ts[i - 1]) / DAY);
  }
  const typicalGap = repeatGaps.length ? Math.max(median(repeatGaps), 3) : 14;
  const codes = new Map(input.customers.map((c) => [c.id, c.code]));
  const segments = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<Segment, number>;
  const list: CustomerInsight[] = [];
  for (const [id, os] of byCustomer) {
    const ts = os.map((o) => t(o.placedAt)).sort((a, b) => a - b);
    const sinceDays = (now - ts[ts.length - 1]) / DAY;
    const gaps = ts.slice(1).map((x, i) => (x - ts[i]) / DAY);
    const usualGap = gaps.length ? Math.max(gaps.reduce((a, b) => a + b, 0) / gaps.length, 1) : undefined;
    const overdue = sinceDays / (usualGap ?? typicalGap);
    // Logistic in "how late vs their usual gap": 1.5x late ≈ 50% risk, 3x late ≈ 99%.
    const risk = Math.round(100 / (1 + Math.exp(-3 * (overdue - 1.5))));
    const revenue = os.reduce((s, o) => s + o.amount, 0);
    const perOrder = revenue / os.length;
    // What this customer is worth over a year if they keep their usual rhythm (what's at stake).
    const ordersPerYear = 365 / Math.min(Math.max(usualGap ?? typicalGap, 3), 120);
    let segment: Segment;
    if (os.length === 1) segment = sinceDays <= 30 ? "New" : sinceDays <= 60 ? "At risk" : "Lost";
    else if (overdue >= 3) segment = "Lost";
    else if (overdue >= 1.5) segment = "At risk";
    else segment = os.length >= 4 ? "Champions" : "Loyal";
    segments[segment]++;
    list.push({ code: codes.get(id) ?? "—", segment, orders: os.length, revenue: Math.round(revenue), sinceDays: Math.round(sinceDays), usualGapDays: usualGap ? Math.round(usualGap) : undefined, risk, value12m: Math.round(perOrder * ordersPerYear) });
  }
  const atRisk = list.filter((c) => c.segment === "At risk");
  const lastMonth = new Set(live.filter((o) => inDays(o, 60, 30) && o.customerId).map((o) => o.customerId!));
  const thisMonth = new Set(live.filter((o) => inDays(o, 30) && o.customerId).map((o) => o.customerId!));
  const returned = [...lastMonth].filter((c) => thisMonth.has(c)).length;

  // ---------- money ----------
  const unpaid = live.filter((o) => o.status === "COMPLETED" && o.paymentStatus !== "PAID" && o.amount > 0 && o.completedAt);
  const buckets = [
    { bucket: "0–7 days", lo: 0, hi: 7 },
    { bucket: "8–14 days", lo: 8, hi: 14 },
    { bucket: "15–30 days", lo: 15, hi: 30 },
    { bucket: "30+ days", lo: 31, hi: Infinity },
  ];
  const aging = buckets.map((b) => {
    const os = unpaid.filter((o) => {
      const d = Math.floor((now - t(o.completedAt!)) / DAY);
      return d >= b.lo && d <= b.hi;
    });
    return { bucket: b.bucket, count: os.length, amount: Math.round(os.reduce((s, o) => s + o.amount, 0)) };
  });
  const paidTimes = live.filter((o) => o.paymentStatus === "PAID" && o.paymentConfirmedAt && o.completedAt).map((o) => Math.max(0, (t(o.paymentConfirmedAt!) - t(o.completedAt!)) / DAY));
  const paidIn7 = paidTimes.length ? paidTimes.filter((d) => d <= 7).length / paidTimes.length : 0.7;
  const completed30 = live.filter((o) => inDays(o, 30) && o.status === "COMPLETED");
  const billed = completed30.reduce((s, o) => s + o.amount, 0);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = 7 * (8 - i);
    const os = live.filter((o) => inDays(o, from, from - 7));
    return { week: istDate(now - from * DAY).slice(5), revenue: Math.round(os.reduce((s, o) => s + o.amount, 0)) };
  });
  const money: Insights["money"] = {
    aging,
    outstanding: Math.round(unpaid.reduce((s, o) => s + o.amount, 0)),
    medianDaysToPay: paidTimes.length >= 3 ? r1(median(paidTimes)) : null,
    collectionPct: billed ? Math.round((completed30.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.amount, 0) / billed) * 100) : 100,
    expectedIn7Days: Math.round(aging[0].amount * paidIn7 + aging[1].amount * paidIn7 * 0.6 + (aging[2].amount + aging[3].amount) * 0.15),
    weeklyRevenue: weeks,
  };

  // ---------- areas ----------
  const areaOf = new Map(input.devices.map((d) => [d.deviceId, d.area?.trim() || "Unlabelled"]));
  const areaStats = new Map<string, { now: number; prev: number; revenue: number }>();
  for (const o of live) {
    const a = areaOf.get(o.deviceId) ?? "Unlabelled";
    const s = areaStats.get(a) ?? { now: 0, prev: 0, revenue: 0 };
    if (inDays(o, 30)) {
      s.now++;
      s.revenue += o.amount;
    } else if (inDays(o, 60, 30)) s.prev++;
    areaStats.set(a, s);
  }
  const total30 = [...areaStats.values()].reduce((s, a) => s + a.now, 0);
  const areas = [...areaStats.entries()]
    .filter(([, s]) => s.now || s.prev)
    .map(([area, s]) => ({ area, orders: s.now, revenue: Math.round(s.revenue), growthPct: s.prev >= 3 ? Math.round(((s.now - s.prev) / s.prev) * 100) : null, share: total30 ? Math.round((s.now / total30) * 100) : 0 }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 8);

  // ---------- drivers ----------
  const drivers = input.drivers
    .filter((d) => d.chatId)
    .map((d) => {
      const done = live.filter((o) => o.driverId === d.chatId && o.status === "COMPLETED" && inDays(o, 30));
      const mins = done.filter((o) => o.assignedAt && o.completedAt).map((o) => (t(o.completedAt!) - t(o.assignedAt!)) / 60_000).filter((m) => m >= 0);
      return {
        name: d.name,
        pickups: done.length,
        medianMins: mins.length ? Math.round(median(mins)) : null,
        onTimePct: mins.length ? Math.round((mins.filter((m) => m <= 120).length / mins.length) * 100) : null,
        declines: live.filter((o) => inDays(o, 30) && o.declinedBy.includes(d.chatId!)).length,
      };
    })
    .sort((a, b) => b.pickups - a.pickups);

  // ---------- anomalies: last 14 days vs the same weekday's typical range ----------
  const anomalies: Insights["anomalies"] = [];
  const hist = series.slice(-70, -14);
  for (const d of series.slice(-14)) {
    const same = hist.filter((h) => h.wd === d.wd).map((h) => h.n);
    if (same.length < 4) continue;
    const med = median(same);
    const mad = median(same.map((x) => Math.abs(x - med))) || 1;
    const z = (d.n - med) / (1.4826 * mad);
    if (Math.abs(z) > 2.5 && Math.abs(d.n - med) >= 3) anomalies.push({ date: d.date, weekday: WD[d.wd], actual: d.n, expected: r1(med), direction: z > 0 ? "spike" : "drop" });
  }

  return {
    data: { orders: live.length, days: span, level },
    forecast,
    heatmap: { cells, peak },
    customers: {
      segments,
      list: [...atRisk.sort((a, b) => b.value12m - a.value12m), ...list.filter((c) => c.segment !== "At risk").sort((a, b) => b.risk - a.risk)].slice(0, 12),
      revenueAtRisk: Math.round(atRisk.reduce((s, c) => s + c.value12m, 0)),
      retention30: lastMonth.size >= 5 ? Math.round((returned / lastMonth.size) * 100) : null,
      avgOrderValue: Math.round(aov),
    },
    money,
    areas,
    drivers,
    anomalies,
  };
}

/** A compact, PII-free summary of the analytics for the language model. */
export function insightsSummary(i: Insights) {
  return {
    dataLevel: i.data.level,
    forecastAccuracyPct: i.forecast.accuracyPct,
    next30Days: i.forecast.next30,
    weeklyTrendPct: i.forecast.trendPct,
    peakWindow: i.heatmap.peak,
    segments: i.customers.segments,
    revenueAtRisk12m: i.customers.revenueAtRisk,
    retention30Pct: i.customers.retention30,
    avgOrderValue: i.customers.avgOrderValue,
    topAtRisk: i.customers.list.filter((c) => c.segment === "At risk").slice(0, 5).map((c) => ({ code: c.code, orders: c.orders, sinceDays: c.sinceDays, usualGapDays: c.usualGapDays, value12m: c.value12m })),
    aging: i.money.aging,
    medianDaysToPay: i.money.medianDaysToPay,
    expectedCollectionsNext7Days: i.money.expectedIn7Days,
    topAreas: i.areas.slice(0, 4),
    drivers: i.drivers.map((d) => ({ pickups30d: d.pickups, medianMins: d.medianMins, onTimePct: d.onTimePct, declines: d.declines })),
    anomalies: i.anomalies,
  };
}
