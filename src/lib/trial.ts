import "server-only";
import { notifyTrialChanged } from "./email/notify";
import { supabaseAdmin } from "./supabase/admin";

// Changing a business's free trial, shared by the owner's Businesses page and the owner's assistant. Callers check
// that the signed-in user is the owner first. Neither change touches a paid plan or a suspension; the manager is
// emailed either way.

/** Adds days to whatever is left of the trial, or starts from now if it already ran out. Returns the new end. */
export async function extendTrialBy(tenantId: string, days: number): Promise<string> {
  if (!(Number.isInteger(days) && days >= 1 && days <= 365)) throw new Error("Enter 1–365 days.");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tenants").select("trial_ends_at").eq("id", tenantId).maybeSingle();
  if (!t) throw new Error("Business not found.");
  const from = Math.max(Date.now(), t.trial_ends_at ? new Date(t.trial_ends_at as string).getTime() : 0);
  const until = new Date(from + days * 86_400_000).toISOString();
  const { error } = await db.from("tenants").update({ trial_ends_at: until }).eq("id", tenantId);
  if (error) throw new Error("Couldn't save the new trial date.");
  await notifyTrialChanged(tenantId, until, false);
  return until;
}

/** Ends a running trial now: the business moves to Toss Free straight away. */
export async function endTrialNow(tenantId: string): Promise<void> {
  const at = new Date().toISOString();
  const { data, error } = await supabaseAdmin().from("tenants").update({ trial_ends_at: at }).eq("id", tenantId).gt("trial_ends_at", at).select("id");
  if (error) throw new Error("Couldn't end the trial.");
  if (!data?.length) throw new Error("This business isn't on a trial.");
  await notifyTrialChanged(tenantId, at, true);
}
