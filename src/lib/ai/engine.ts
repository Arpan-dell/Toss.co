// Toss AI decision engine. Pure and deterministic: given a business's recent history it computes
// KPIs, a 7-day demand forecast, a health score and every action worth taking, each already within
// the manager's guardrails. The language model (see ./brain.ts) then explains the numbers and
// prioritises/personalises these candidates; it can never act on anything not produced here.

export type ActionType = "driver_alert" | "set_max_jobs" | "winback_offer" | "payment_reminder" | "basket_nudge" | "price_change";
export type Category = "staffing" | "winback" | "nudges" | "pricing";

export const CATEGORY_OF: Record<ActionType, Category> = {
  driver_alert: "staffing",
  set_max_jobs: "staffing",
  winback_offer: "winback",
  payment_reminder: "nudges",
  basket_nudge: "nudges",
  price_change: "pricing",
};

export interface Guardrails {
  maxDiscount: number; // % cap for any offer
  priceMin?: number;
  priceMax?: number;
  priceStepPct: number; // largest single price move
}

export interface EngineInput {
  now: string;
  tenant: { pricePerKg: number; winbackPct: number };
  guardrails: Guardrails;
  orders: { placedAt: string; completedAt?: string; weightKg: number; amount: number; status: string; paid: boolean; customerId?: string }[];
  customers: { id: string; code: string; reachable: boolean; openOffer: boolean }[];
  unpaid: { orderId: string; label: string; customerId?: string; customerCode?: string; amount: number; completedAt: string; reachable: boolean }[];
  baskets: { deviceId: string; customerId?: string; customerCode?: string; fillPct: number; reachable: boolean }[];
  drivers: { id: string; name: string; connected: boolean; maxJobs: number }[];
  /** "type:target" of actions executed recently (cool-down), e.g. "payment_reminder:<order id>". */
  recent: string[];
}

export interface Candidate {
  id: string; // stable within a run: c1, c2, …
  type: ActionType;
  target: string;
  label: string;
  params: Record<string, string | number>;
  reason: string;
  impact: string;
  priority: 1 | 2 | 3;
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD (IST)
  weekday: string;
  expectedOrders: number;
  expectedKg: number;
  driversNeeded: number;
  driversConnected: number;
}

export interface Kpis {
  orders30: number;
  ordersPrev30: number;
  revenue30: number;
  kg30: number;
  growthPct: number; // orders, last 30 vs previous 30 days
  collectionPct: number; // paid share of completed revenue, last 30 days
  avgPickupHrs: number; // placed → picked up
  activeCustomers: number; // ordered in the last 30 days
  repeatPct: number; // of customers with 2+ orders (all time in the window)
  outstanding: number; // unpaid completed revenue
}

export interface Analysis {
  kpis: Kpis;
  forecast: ForecastDay[];
  health: { score: number; parts: { growth: number; collection: number; speed: number; retention: number } };
  candidates: Candidate[];
}

const DAY = 86_400_000;
const IST = 330 * 60_000;
export const PICKUPS_PER_DRIVER_PER_DAY = 8;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const istDay = (t: number) => new Date(t + IST).toISOString().slice(0, 10);
const istWeekday = (t: number) => new Date(t + IST).getUTCDay();

export function analyze(input: EngineInput): Analysis {
  const now = new Date(input.now).getTime();
  const live = input.orders.filter((o) => o.status !== "CANCELLED");
  const at = (iso: string) => new Date(iso).getTime();
  const inLast = (o: { placedAt: string }, from: number, to: number) => at(o.placedAt) >= now - from * DAY && at(o.placedAt) < now - to * DAY;

  // ---------- KPIs ----------
  const last30 = live.filter((o) => inLast(o, 30, 0));
  const prev30 = live.filter((o) => inLast(o, 60, 30));
  const completed30 = last30.filter((o) => o.status === "COMPLETED");
  const billed = completed30.reduce((s, o) => s + o.amount, 0);
  const paid = completed30.filter((o) => o.paid).reduce((s, o) => s + o.amount, 0);
  const pickupHrs = live.filter((o) => o.completedAt).map((o) => (at(o.completedAt!) - at(o.placedAt)) / 3_600_000);
  const perCustomer = new Map<string, number[]>();
  for (const o of live) if (o.customerId) perCustomer.set(o.customerId, [...(perCustomer.get(o.customerId) ?? []), at(o.placedAt)]);
  const repeaters = [...perCustomer.values()].filter((t) => t.length >= 2).length;

  const kpis: Kpis = {
    orders30: last30.length,
    ordersPrev30: prev30.length,
    revenue30: Math.round(last30.reduce((s, o) => s + o.amount, 0)),
    kg30: round1(last30.reduce((s, o) => s + o.weightKg, 0)),
    growthPct: prev30.length ? Math.round(((last30.length - prev30.length) / prev30.length) * 100) : last30.length ? 100 : 0,
    collectionPct: billed ? Math.round((paid / billed) * 100) : 100,
    avgPickupHrs: pickupHrs.length ? round1(pickupHrs.reduce((a, b) => a + b, 0) / pickupHrs.length) : 0,
    activeCustomers: new Set(last30.map((o) => o.customerId).filter(Boolean)).size,
    repeatPct: perCustomer.size ? Math.round((repeaters / perCustomer.size) * 100) : 0,
    outstanding: Math.round(input.unpaid.reduce((s, u) => s + u.amount, 0)),
  };

  // ---------- forecast: weekday averages over the last 8 weeks × recent trend ----------
  const window = live.filter((o) => inLast(o, 56, 0));
  const byWeekday = Array.from({ length: 7 }, () => ({ orders: 0, kg: 0 }));
  for (const o of window) {
    const w = byWeekday[istWeekday(at(o.placedAt))];
    w.orders++;
    w.kg += o.weightKg;
  }
  const weeksOfData = window.length ? clamp(Math.ceil((now - Math.min(...window.map((o) => at(o.placedAt)))) / (7 * DAY)), 1, 8) : 1;
  const recent28 = live.filter((o) => inLast(o, 28, 0)).length;
  const older28 = live.filter((o) => inLast(o, 56, 28)).length;
  const trend = older28 >= 4 ? clamp(recent28 / older28, 0.7, 1.5) : 1;
  const connected = input.drivers.filter((d) => d.connected).length;
  const forecast: ForecastDay[] = Array.from({ length: 7 }, (_, i) => {
    const t = now + (i + 1) * DAY;
    const w = byWeekday[istWeekday(t)];
    const expectedOrders = round1((w.orders / weeksOfData) * trend);
    return {
      date: istDay(t),
      weekday: WEEKDAY[istWeekday(t)],
      expectedOrders,
      expectedKg: round1((w.kg / weeksOfData) * trend),
      driversNeeded: Math.ceil(expectedOrders / PICKUPS_PER_DRIVER_PER_DAY),
      driversConnected: connected,
    };
  });
  const avgDaily = forecast.reduce((s, d) => s + d.expectedOrders, 0) / 7;

  // ---------- health score (0-100) ----------
  const parts = {
    growth: Math.round(clamp(12.5 + kpis.growthPct / 4, 0, 25)), // flat = half marks
    collection: Math.round((kpis.collectionPct / 100) * 25),
    speed: kpis.avgPickupHrs ? Math.round(clamp(20 - (kpis.avgPickupHrs - 2) * 2, 0, 20)) : 10,
    retention: Math.round((kpis.repeatPct / 100) * 30),
  };
  const health = { score: parts.growth + parts.collection + parts.speed + parts.retention, parts };

  // ---------- candidate actions ----------
  const cands: Omit<Candidate, "id">[] = [];
  const cooling = new Set(input.recent);

  // Staffing: busy days in the next 2 days, and too little capacity in the week.
  for (const d of forecast.slice(0, 2)) {
    const busy = d.expectedOrders >= Math.max(2, avgDaily * 1.3);
    const short = d.driversNeeded > connected;
    if ((busy || short) && !cooling.has(`driver_alert:${d.date}`)) {
      cands.push({
        type: "driver_alert",
        target: d.date,
        label: `Alert drivers: ~${Math.round(d.expectedOrders)} pickups expected ${d.weekday} ${d.date.slice(5)}`,
        params: { date: d.date, weekday: d.weekday, expectedOrders: Math.round(d.expectedOrders) },
        reason: short
          ? `About ${d.driversNeeded} driver(s) needed but only ${connected} connected.`
          : `${d.weekday} usually runs ${Math.round((d.expectedOrders / Math.max(avgDaily, 0.1) - 1) * 100)}% above an average day.`,
        impact: "Fewer late pickups on a peak day.",
        priority: short ? 1 : 2,
      });
    }
  }
  const peak = Math.max(0, ...forecast.map((d) => d.expectedOrders));
  if (connected > 0 && peak > connected * PICKUPS_PER_DRIVER_PER_DAY * 0.75) {
    for (const drv of input.drivers.filter((d) => d.connected && d.maxJobs < 6)) {
      if (cooling.has(`set_max_jobs:${drv.id}`)) continue;
      cands.push({
        type: "set_max_jobs",
        target: drv.id,
        label: `Let ${drv.name} carry ${drv.maxJobs + 1} pickups at once (now ${drv.maxJobs})`,
        params: { driverId: drv.id, driverName: drv.name, from: drv.maxJobs, to: drv.maxJobs + 1 },
        reason: `Peak day this week needs ~${Math.round(peak)} pickups for ${connected} driver(s).`,
        impact: "More pickups per trip on busy days.",
        priority: 2,
      });
    }
  }

  // Win-back: customers who are late against their OWN usual gap between orders.
  const offerPct = (orders: number) => clamp(input.tenant.winbackPct + (orders >= 5 ? 5 : 0), 1, input.guardrails.maxDiscount);
  const quiet = input.customers
    .map((c) => {
      const times = (perCustomer.get(c.id) ?? []).sort((a, b) => a - b);
      if (times.length < 2 || c.openOffer || !c.reachable) return null;
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const usualGapDays = gaps.reduce((a, b) => a + b, 0) / gaps.length / DAY;
      const sinceDays = (now - times[times.length - 1]) / DAY;
      const due = Math.max(usualGapDays * 1.5, 10);
      return sinceDays > due ? { c, orders: times.length, usualGapDays, sinceDays } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && !cooling.has(`winback_offer:${x.c.id}`))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);
  for (const q of quiet) {
    const pct = offerPct(q.orders);
    cands.push({
      type: "winback_offer",
      target: q.c.id,
      label: `Offer ${q.c.code} ${pct}% off their next pickup`,
      params: { customerId: q.c.id, customerCode: q.c.code, pct, sinceDays: Math.round(q.sinceDays), usualGapDays: Math.round(q.usualGapDays), orders: q.orders },
      reason: `Usually orders every ${Math.round(q.usualGapDays)} days; it's been ${Math.round(q.sinceDays)}. ${q.orders} orders so far.`,
      impact: "Brings a regular customer back before they switch laundries.",
      priority: q.orders >= 5 ? 1 : 2,
    });
  }

  // Nudges: unpaid invoices (2+ days) and nearly-full baskets.
  for (const u of input.unpaid) {
    const days = Math.floor((now - at(u.completedAt)) / DAY);
    if (days < 2 || !u.reachable || cooling.has(`payment_reminder:${u.orderId}`)) continue;
    cands.push({
      type: "payment_reminder",
      target: u.orderId,
      label: `Remind ${u.customerCode ?? "customer"} to pay ₹${Math.round(u.amount)} (${u.label})`,
      params: { orderId: u.orderId, amount: Math.round(u.amount), days, customerCode: u.customerCode ?? "" },
      reason: `Picked up ${days} days ago and still unpaid.`,
      impact: `Collects ₹${Math.round(u.amount)} sooner.`,
      priority: days >= 7 ? 1 : 2,
    });
  }
  for (const b of input.baskets) {
    if (b.fillPct < 80 || b.fillPct >= 100 || !b.reachable || cooling.has(`basket_nudge:${b.deviceId}`)) continue;
    cands.push({
      type: "basket_nudge",
      target: b.deviceId,
      label: `Tell ${b.customerCode ?? "the customer"} their basket is ${Math.round(b.fillPct)}% full`,
      params: { deviceId: b.deviceId, fillPct: Math.round(b.fillPct), customerCode: b.customerCode ?? "" },
      reason: "Almost at the auto-pickup weight.",
      impact: "Sets expectations for the coming pickup.",
      priority: 3,
    });
  }

  // Pricing: strong sustained demand with too few drivers → nudge up; demand slump → nudge down.
  const { priceMin, priceMax, priceStepPct } = input.guardrails;
  const price = input.tenant.pricePerKg;
  const shortDays = forecast.filter((d) => d.driversNeeded > connected).length;
  let dir = 0;
  if (kpis.ordersPrev30 >= 10 && kpis.growthPct >= 25 && shortDays >= 2) dir = 1;
  else if (kpis.ordersPrev30 >= 10 && kpis.growthPct <= -25) dir = -1;
  if (dir && !cooling.has(`price_change:business`)) {
    const lo = priceMin ?? price * 0.8;
    const hi = priceMax ?? price * 1.2;
    const to = Math.round(clamp(price * (1 + (dir * priceStepPct) / 100), lo, hi));
    if (to !== Math.round(price)) {
      cands.push({
        type: "price_change",
        target: "business",
        label: `${dir > 0 ? "Raise" : "Lower"} price from ₹${price}/kg to ₹${to}/kg`,
        params: { from: price, to },
        reason:
          dir > 0
            ? `Orders up ${kpis.growthPct}% and ${shortDays} day(s) this week short of drivers.`
            : `Orders down ${Math.abs(kpis.growthPct)}% versus the previous 30 days.`,
        impact: dir > 0 ? "More revenue per pickup while demand is high." : "Win back price-sensitive customers.",
        priority: 2,
      });
    }
  }

  return { kpis, forecast, health, candidates: cands.map((c, i) => ({ ...c, id: `c${i + 1}` })) };
}

/** What the AI may change about a candidate. Everything else stays as the engine built it. */
export interface AiDecision {
  candidateId: string;
  approve: boolean;
  discountPct?: number;
  newPrice?: number;
  message?: string;
  reason?: string;
  priority?: number;
}

const tidy = (s: string | undefined, max: number) =>
  (s ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * Applies the AI's choices to the engine's candidates, enforcing the guardrails again: unknown ids are
 * ignored, discounts and prices are clamped, free text is shortened and stripped of markup.
 */
export function applyDecisions(candidates: Candidate[], decisions: AiDecision[] | undefined, input: Pick<EngineInput, "tenant" | "guardrails">): Candidate[] {
  if (!decisions?.length) return candidates;
  const byId = new Map(decisions.map((d) => [d.candidateId, d]));
  const { maxDiscount, priceMin, priceMax, priceStepPct } = input.guardrails;
  const price = input.tenant.pricePerKg;
  return candidates
    .filter((c) => byId.get(c.id)?.approve !== false)
    .map((c) => {
      const d = byId.get(c.id);
      if (!d) return c;
      const next: Candidate = { ...c, params: { ...c.params } };
      if (d.reason) next.reason = tidy(d.reason, 240);
      if (d.priority && [1, 2, 3].includes(d.priority)) next.priority = d.priority as 1 | 2 | 3;
      // Customers see this text: never let an internal customer code through.
      if (d.message) next.params.message = tidy(d.message.replace(/\bC-[A-Z0-9]{6}\b,?/g, ""), 300);
      if (c.type === "winback_offer" && d.discountPct !== undefined) {
        const pct = clamp(Math.round(d.discountPct), 1, maxDiscount);
        next.params.pct = pct;
        next.label = `Offer ${c.params.customerCode} ${pct}% off their next pickup`;
      }
      if (c.type === "price_change" && d.newPrice !== undefined) {
        const lo = Math.max(priceMin ?? 0, price * (1 - priceStepPct / 100));
        const hi = Math.min(priceMax ?? Infinity, price * (1 + priceStepPct / 100));
        const to = Math.round(clamp(d.newPrice, lo, hi));
        if (to === Math.round(price)) return null;
        next.params.to = to;
        next.label = `${to > price ? "Raise" : "Lower"} price from ₹${price}/kg to ₹${to}/kg`;
      }
      return next;
    })
    .filter((c): c is Candidate => !!c);
}
