import "server-only";
import { reminderFor } from "../plan";
import { supabaseAdmin } from "../supabase/admin";
import { emailEnabled, ownerEmail, sendEmail } from "./mailer";
import * as t from "./templates";
import { logError } from "@/lib/log";

// Business events → emails to the Toss owner and the business's manager. Every function is
// best-effort and never throws: the action that triggered it has already succeeded.

type TenantRow = {
  id: string;
  name: string;
  join_code: string;
  manager_id: string | null;
  price_per_kg: number;
  plan_status: "TRIAL" | "ACTIVE" | "SUSPENDED";
  trial_ends_at: string | null;
  paid_until: string | null;
  reminder_key: string | null;
};

const COLS = "id, name, join_code, manager_id, price_per_kg, plan_status, trial_ends_at, paid_until, reminder_key";

async function tenant(id: string): Promise<TenantRow | null> {
  const { data } = await supabaseAdmin().from("tenants").select(COLS).eq("id", id).maybeSingle();
  return data as TenantRow | null;
}

async function managerEmail(managerId: string | null): Promise<string | undefined> {
  if (!managerId) return undefined;
  const { data } = await supabaseAdmin().auth.admin.getUserById(managerId);
  return data.user?.email ?? undefined;
}

const safely = async (what: string, fn: () => Promise<unknown>) => {
  if (!emailEnabled()) return;
  try {
    await fn();
  } catch (err) {
    logError(`notify ${what} failed`, err);
  }
};

export const notifyBusinessRegistered = (tenantId: string) =>
  safely("business registered", async () => {
    const b = await tenant(tenantId);
    if (!b) return;
    const manager = await managerEmail(b.manager_id);
    await Promise.all([
      sendEmail(manager, t.managerWelcome({ name: b.name, joinCode: b.join_code, trialEndsAt: b.trial_ends_at ?? undefined }), { replyTo: ownerEmail() }),
      sendEmail(
        ownerEmail(),
        t.ownerNewBusiness({ name: b.name, joinCode: b.join_code, managerEmail: manager ?? "—", pricePerKg: b.price_per_kg, trialEndsAt: b.trial_ends_at ?? undefined }),
        { replyTo: manager },
      ),
    ]);
  });

export const notifySubscriptionSubmitted = (tenantId: string, ref: string) =>
  safely("subscription submitted", async () => {
    const [b, { data: p }] = await Promise.all([
      tenant(tenantId),
      supabaseAdmin().from("subscription_payments").select("months, amount, discount_pct").eq("tenant_id", tenantId).eq("payment_ref", ref).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!b || !p) return;
    const manager = await managerEmail(b.manager_id);
    const info = { business: b.name, months: p.months as number, amount: p.amount as number, discountPct: (p.discount_pct as number) ?? 0, ref };
    await Promise.all([
      sendEmail(ownerEmail(), t.ownerPaymentToReview({ ...info, joinCode: b.join_code }), { replyTo: manager }),
      sendEmail(manager, t.managerPaymentReceived(info), { replyTo: ownerEmail() }),
    ]);
  });

export const notifySubscriptionReviewed = (paymentId: number) =>
  safely("subscription reviewed", async () => {
    const { data: p } = await supabaseAdmin().from("subscription_payments").select("tenant_id, months, amount, status, payment_ref").eq("id", paymentId).maybeSingle();
    if (!p) return;
    const b = await tenant(p.tenant_id as string);
    if (!b) return;
    const email =
      p.status === "APPROVED"
        ? t.managerPaymentApproved({ business: b.name, months: p.months as number, amount: p.amount as number, paidUntil: b.paid_until ?? undefined })
        : t.managerPaymentRejected({ business: b.name, amount: p.amount as number, ref: p.payment_ref as string });
    await sendEmail(await managerEmail(b.manager_id), email, { replyTo: ownerEmail() });
  });

export const notifySuspension = (tenantId: string, suspended: boolean) =>
  safely("suspension", async () => {
    const b = await tenant(tenantId);
    if (b) await sendEmail(await managerEmail(b.manager_id), t.managerSuspended({ business: b.name, suspended }), { replyTo: ownerEmail() });
  });

export const notifyClosureRequested = (tenantId: string, reason: string) =>
  safely("closure request", async () => {
    const b = await tenant(tenantId);
    if (!b) return;
    const manager = await managerEmail(b.manager_id);
    await Promise.all([
      sendEmail(ownerEmail(), t.ownerClosureRequest({ name: b.name, joinCode: b.join_code, managerEmail: manager ?? "—", reason }), { replyTo: manager }),
      sendEmail(manager, t.managerClosureReceived({ name: b.name }), { replyTo: ownerEmail() }),
    ]);
  });

/** Daily: renewal reminders to managers (and a heads-up to the owner when a business lapses). */
export async function runPlanReminders(): Promise<{ sent: number }> {
  if (!emailEnabled()) return { sent: 0 };
  const db = supabaseAdmin();
  const [{ data: tenants }, { data: ps }] = await Promise.all([
    db.from("tenants").select(COLS),
    db.from("platform_settings").select("monthly_price, discount_3m, discount_6m, discount_12m").eq("id", 1).maybeSingle(),
  ]);
  let sent = 0;
  for (const b of (tenants ?? []) as TenantRow[]) {
    const r = reminderFor({ planStatus: b.plan_status, trialEndsAt: b.trial_ends_at ?? undefined, paidUntil: b.paid_until ?? undefined });
    if (!r || r.key === b.reminder_key) continue;
    const manager = await managerEmail(b.manager_id);
    const ok = await sendEmail(
      manager,
      t.managerPlanReminder({
        business: b.name,
        kind: r.kind,
        daysLeft: r.daysLeft,
        until: r.until,
        monthlyPrice: (ps?.monthly_price as number) ?? 0,
        bestDiscount: Math.max((ps?.discount_3m as number) ?? 0, (ps?.discount_6m as number) ?? 0, (ps?.discount_12m as number) ?? 0),
      }),
      { replyTo: ownerEmail() },
    );
    if (r.daysLeft <= 0) await sendEmail(ownerEmail(), t.ownerBusinessLapsed({ name: b.name, joinCode: b.join_code, managerEmail: manager ?? "—", wasTrial: r.kind === "TRIAL" }));
    if (ok) {
      sent++;
      await db.from("tenants").update({ reminder_key: r.key }).eq("id", b.id);
    }
  }
  return { sent };
}
