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
