// Toss subscription state for a business, derived from its plan fields. A business is usable
// while it is in its free trial or has paid up; the owner can suspend it at any time.

export type PlanState = "TRIAL" | "ACTIVE" | "EXPIRED" | "SUSPENDED";

export interface PlanFields {
  planStatus: "TRIAL" | "ACTIVE" | "SUSPENDED";
  trialEndsAt?: string;
  paidUntil?: string;
}

export function planState(t: PlanFields, now = new Date()): { state: PlanState; until?: string; daysLeft?: number } {
  if (t.planStatus === "SUSPENDED") return { state: "SUSPENDED" };
  const n = now.getTime();
  const days = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - n) / 86_400_000));
  if (t.paidUntil && new Date(t.paidUntil).getTime() > n) return { state: "ACTIVE", until: t.paidUntil, daysLeft: days(t.paidUntil) };
  if (t.trialEndsAt && new Date(t.trialEndsAt).getTime() > n) return { state: "TRIAL", until: t.trialEndsAt, daysLeft: days(t.trialEndsAt) };
  return { state: "EXPIRED", until: t.paidUntil ?? t.trialEndsAt };
}

export const isUsable = (s: PlanState) => s === "TRIAL" || s === "ACTIVE";

/**
 * What a business can use. PRO: trial or paid (every feature). FREE: the trial or paid time has run out; the
 * business keeps running (pickups, dispatch, payments, orders, customers, fleet) but the Pro tools are off.
 * LOCKED: suspended by Toss. Customers are never affected by any of these.
 */
export type Tier = "PRO" | "FREE" | "LOCKED";
export const tierOf = (s: PlanState): Tier => (s === "SUSPENDED" ? "LOCKED" : s === "EXPIRED" ? "FREE" : "PRO");

/** Which renewal reminder (if any) a business is due: 7/3/1 days before, and once when it ends. */
export function reminderFor(b: PlanFields, now = new Date()) {
  const p = planState(b, now);
  if (p.state === "SUSPENDED" || !p.until) return null;
  const kind: "TRIAL" | "ACTIVE" = p.state === "EXPIRED" ? (b.paidUntil ? "ACTIVE" : "TRIAL") : p.state;
  const daysLeft = p.state === "EXPIRED" ? 0 : (p.daysLeft ?? 0);
  // Expired more than a week ago: they've been told; don't start emailing old businesses.
  if (p.state === "EXPIRED" && now.getTime() - new Date(p.until).getTime() > 7 * 86_400_000) return null;
  const buckets = kind === "TRIAL" ? [0, 1, 3] : [0, 1, 3, 7];
  const bucket = buckets.find((d) => daysLeft <= d);
  if (bucket === undefined) return null;
  return { kind, daysLeft, until: p.until, key: `${kind}:${p.until.slice(0, 10)}:${bucket}` };
}
