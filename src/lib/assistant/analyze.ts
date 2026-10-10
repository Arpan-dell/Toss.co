// "Should I add a driver?", "are my drivers overworked?", "why is my bill higher?": questions that need judgement,
// not a fixed report. We work out the numbers that matter here (pure, so it's tested), the AI writes the advice
// from those numbers only, and the reply shows the same numbers so the advice can be checked.
//
// Privacy: the AI gets counts, averages and money totals. Drivers are "Driver 1, 2 …" and businesses
// "Business 1, 2 …"; names, phones, addresses and locations never leave our servers. Real names are put back only
// in the table the person sees, by our own code.

import type { Driver, Order, Tenant } from "../types";

const DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ups = (n: number) => pl(n, "pickup", "pickups");
const drops = (n: number) => pl(n, "delivery", "deliveries");
const mins = (a?: string, b?: string) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 60_000 : undefined);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
const IST = 330 * 60_000;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Snapshot = {
  /** anonymous facts for the AI: label → value */
  facts: Record<string, string | number>;
  /** what the person sees under the answer (may include real names) */
  rows: [string, string][];
};

function startOfDayIST(at: Date) {
  const d = new Date(at.getTime() + IST);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST);
}

/** Busiest weekday and hour (India time) over these orders, as words. */
function peaks(orders: Order[]) {
  const byDay = new Array(7).fill(0), byHour = new Array(24).fill(0);
  for (const o of orders) {
    const d = new Date(new Date(o.createdAt).getTime() + IST);
    byDay[d.getUTCDay()]++;
    byHour[d.getUTCHours()]++;
  }
  const day = byDay.indexOf(Math.max(...byDay)), hour = byHour.indexOf(Math.max(...byHour));
  const h12 = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
  return orders.length ? { day: WEEKDAY[day], hour: `${h12(hour)}–${h12((hour + 1) % 24)}` } : undefined;
}

export function managerSnapshot(orders: Order[], drivers: Driver[], tenant: Pick<Tenant, "pricePerKg" | "turnaroundHours" | "delivers">, now: Date): Snapshot {
  const today = startOfDayIST(now);
  const week = new Date(now.getTime() - 7 * DAY), month = new Date(now.getTime() - 30 * DAY);
  const inWeek = orders.filter((o) => new Date(o.createdAt) >= week);
  const inMonth = orders.filter((o) => new Date(o.createdAt) >= month);
  const active = (o: Order) => o.status === "PENDING" || o.status === "ACCEPTED";
  const onDuty = drivers.filter((d) => d.status !== "OFFLINE");

  // a driver's two kinds of trip: picking clothes up, and taking them back (deliveries)
  const since = (iso: string | undefined, from: Date) => !!iso && new Date(iso) >= from;
  const delivering = (o: Order) => o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "OUT";
  const deliveredWeek = orders.filter((o) => since(o.deliveredAt, week)).length;
  const deliveredMonth = orders.filter((o) => since(o.deliveredAt, month)).length;

  const facts: Snapshot["facts"] = {
    "drivers in total": drivers.length,
    "drivers on duty now": onDuty.length,
    "new pickup orders today": orders.filter((o) => new Date(o.createdAt) >= today).length,
    "new pickup orders in the last 7 days": inWeek.length,
    "pickups per day (last 7 days)": r1(inWeek.length / 7),
    "pickups per day (last 30 days)": r1(inMonth.length / 30),
    "pickups on the go now": orders.filter(active).length,
    "pickups waiting for a driver now": orders.filter((o) => o.status === "PENDING" && !o.driverId).length,
  };
  if (tenant.delivers) {
    facts["deliveries made today"] = orders.filter((o) => since(o.deliveredAt, today)).length;
    facts["deliveries in the last 7 days"] = deliveredWeek;
    facts["deliveries per day (last 7 days)"] = r1(deliveredWeek / 7);
    facts["deliveries per day (last 30 days)"] = r1(deliveredMonth / 30);
    facts["deliveries on the way now"] = orders.filter(delivering).length;
    facts["clean orders waiting for a delivery driver now"] = orders.filter((o) => o.deliveryStatus === "WAITING").length;
    const back = avg(orders.filter((o) => since(o.deliveredAt, week)).map((o) => mins(o.readyAt, o.deliveredAt)).filter((m): m is number => m !== undefined && m >= 0));
    if (back !== undefined) facts["average hours from ready to delivered (last 7 days)"] = r1(back / 60);
  }
  const wait = avg(inWeek.map((o) => mins(o.createdAt, o.acceptedAt)).filter((m): m is number => m !== undefined && m >= 0));
  if (wait !== undefined) facts["average minutes until a driver took a pickup (last 7 days)"] = Math.round(wait);
  const pick = avg(inWeek.map((o) => mins(o.createdAt, o.completedAt)).filter((m): m is number => m !== undefined && m >= 0));
  if (pick !== undefined) facts["average minutes from request to pickup (last 7 days)"] = Math.round(pick);
  const p = peaks(inMonth);
  if (p) {
    facts["busiest day (last 30 days)"] = p.day;
    facts["busiest hour (last 30 days)"] = p.hour;
  }
  const done30 = inMonth.filter((o) => o.status === "COMPLETED");
  facts["revenue in the last 30 days (₹)"] = Math.round(done30.reduce((s, o) => s + (o.amountGross ?? o.amountDue), 0));
  facts["average kg per pickup"] = r1(avg(done30.map((o) => o.weightKg)) ?? 0);
  const unpaid = orders.filter((o) => o.status === "COMPLETED" && o.paymentStatus === "UNPAID");
  facts["unpaid bills"] = `${unpaid.length} worth ₹${Math.round(unpaid.reduce((s, o) => s + o.amountDue, 0))}`;
  facts["price per kg (₹)"] = tenant.pricePerKg;
  facts["promised turnaround (hours)"] = tenant.turnaroundHours;
  facts["delivers back to customers"] = tenant.delivers ? "yes" : "no";

  const rows: Snapshot["rows"] = [];
  drivers.forEach((d, i) => {
    const id = d.telegramChatId;
    const pickedUp = (o: Order) => !!id && o.driverId === id;
    const delivered = (o: Order) => !!id && o.deliveryDriverId === id;
    const jobsNow = orders.filter((o) => (pickedUp(o) && active(o)) || (delivered(o) && delivering(o))).length;
    const pickups = (from: Date) => orders.filter((o) => pickedUp(o) && since(o.completedAt, from)).length;
    const deliveries = (from: Date) => orders.filter((o) => delivered(o) && since(o.deliveredAt, from)).length;
    const [pT, pW, dT, dW] = [pickups(today), pickups(week), deliveries(today), deliveries(week)];
    const state = d.status === "OFFLINE" ? "offline" : d.status === "ON_JOB" ? "on a job" : "available";
    facts[`Driver ${i + 1}`] =
      `${state}, ${pl(jobsNow, "job", "jobs")} now (limit ${d.maxJobs}); today ${ups(pT)} and ${drops(dT)}; ` +
      `last 7 days ${ups(pW)} and ${drops(dW)} (${r1((pW + dW) / 7)} trips/day)`;
    rows.push([d.name, `${jobsNow}/${d.maxJobs} now · this week ${ups(pW)} + ${drops(dW)} · today ${pT} + ${dT}`]);
  });
  rows.unshift(
    ["Pickups per day", `${facts["pickups per day (last 7 days)"]} (7 days) · ${facts["pickups per day (last 30 days)"]} (30 days)`],
    ...(tenant.delivers ? ([["Deliveries per day", `${facts["deliveries per day (last 7 days)"]} (7 days) · ${facts["deliveries per day (last 30 days)"]} (30 days)`]] as [string, string][]) : []),
    ["Waiting for a driver", tenant.delivers ? `${ups(Number(facts["pickups waiting for a driver now"]))} · ${drops(Number(facts["clean orders waiting for a delivery driver now"]))}` : String(facts["pickups waiting for a driver now"])],
    ...(wait !== undefined ? ([["Avg wait for a pickup driver", `${Math.round(wait)} min`]] as [string, string][]) : []),
    ["Drivers on duty", `${onDuty.length} of ${drivers.length}`],
  );
  return { facts, rows };
}

export function customerSnapshot(orders: Order[], pricePerKg: number | undefined, credit: { left: number; expired: boolean } | null): Snapshot {
  const done = orders.filter((o) => o.status === "COMPLETED").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = done[0];
  const facts: Snapshot["facts"] = {
    "pickups so far": done.length,
    "average kg per pickup": r1(avg(done.map((o) => o.weightKg)) ?? 0),
    "average bill (₹)": Math.round(avg(done.map((o) => o.amountDue)) ?? 0),
    "unpaid bills (₹)": Math.round(done.filter((o) => o.paymentStatus === "UNPAID").reduce((s, o) => s + o.amountDue, 0)),
  };
  if (pricePerKg) facts["laundry price per kg (₹)"] = pricePerKg;
  if (credit && !credit.expired) facts["basket credit left (₹)"] = Math.round(credit.left);
  const bills = done.slice(0, 5).map((o) => `#${o.deviceOrderId}: ${r1(o.weightKg)} kg, ₹${Math.round(o.amountDue)}${o.creditApplied ? ` after ₹${Math.round(o.creditApplied)} credit` : ""}${o.discountPct ? ` with ${o.discountPct}% off` : ""}${o.weightSource === "driver" && o.reportedWeightKg ? ` (basket said ${r1(o.reportedWeightKg)} kg, driver weighed ${r1(o.weighedKg ?? o.weightKg)} kg)` : ""}`);
  if (bills.length) facts["last bills, newest first"] = bills.join("; ");
  const rows: Snapshot["rows"] = [
    ["Pickups", String(done.length)],
    ["Average", `${facts["average kg per pickup"]} kg · ₹${facts["average bill (₹)"]}`],
    ...(last ? ([["Last bill", `₹${Math.round(last.amountDue)} for ${r1(last.weightKg)} kg`]] as [string, string][]) : []),
  ];
  return { facts, rows };
}

export function ownerSnapshot(tenants: { name: string; state: string; orders30: number; ordersPrev30: number }[], pendingPayments: number): Snapshot {
  const facts: Snapshot["facts"] = { businesses: tenants.length, "subscription payments to check": pendingPayments };
  tenants.forEach((t, i) => (facts[`Business ${i + 1}`] = `${t.state.toLowerCase()}, ${t.orders30} orders in the last 30 days (${t.ordersPrev30} the 30 days before)`));
  const rows: Snapshot["rows"] = tenants.slice(0, 8).map((t) => [t.name, `${t.orders30} orders (was ${t.ordersPrev30}) · ${t.state.toLowerCase()}`]);
  return { facts, rows };
}

/** The fact sheet as plain lines for the AI prompt. */
export const factSheet = (facts: Snapshot["facts"]) => Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`).join("\n");
