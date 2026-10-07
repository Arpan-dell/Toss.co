import "server-only";
import { cache } from "react";
import { planState, tierOf, type Tier } from "./plan";
import { supabaseAdmin } from "./supabase/admin";

// The laundries one manager runs (migration 0024). A manager's session only reaches its current business through
// RLS, so this reads with the service role, always filtered to tenants whose manager is this user.

export interface Branch {
  id: string;
  name: string;
  joinCode: string;
  main: boolean; // the first business; the others are extra branches
  tier: Tier;
}

export const listMyBranches = cache(async (userId: string): Promise<Branch[]> => {
  const { data, error } = await supabaseAdmin()
    .from("tenants")
    .select("id, name, join_code, parent_tenant_id, plan_status, trial_ends_at, paid_until, created_at")
    .eq("manager_id", userId)
    .order("created_at");
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      joinCode: r.join_code as string,
      main: !r.parent_tenant_id,
      tier: tierOf(planState({ planStatus: r.plan_status, trialEndsAt: r.trial_ends_at ?? undefined, paidUntil: r.paid_until ?? undefined }).state),
    }))
    .sort((a, b) => Number(b.main) - Number(a.main));
});
