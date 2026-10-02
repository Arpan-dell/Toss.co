import "server-only";
import { sendEmail } from "../email/mailer";
import { customerPaymentReminder } from "../email/templates";
import { tellCustomer } from "../offers";
import { isUsable, planState } from "../plan";
import { supabaseAdmin } from "../supabase/admin";
import { esc, sendMessage } from "../telegram-api";
import { ASK_SYSTEM, BRAIN_SCHEMA, BRAIN_SYSTEM, brainPrompt, cleanBriefing, modelSafeCandidate, rulesBriefing, type BrainAnswer, type Report } from "./brain";
import { CATEGORY_OF, analyze, applyDecisions, type ActionType, type Candidate, type Category, type EngineInput } from "./engine";
import { geminiEnabled, geminiJson, geminiText } from "./gemini";
import { computeInsights, insightsSummary, type Insights } from "./insights";
import { logError, redact } from "@/lib/log";

// Toss AI orchestration (service role). A run: load the business → engine → Gemini briefing and
// decisions → save the report and action queue → the autopilot executes the categories the manager
// switched on. Every action is re-validated here before it touches a customer, driver or price.

type Row = Record<string, unknown>;
const DAY = 86_400_000;
const db = () => supabaseAdmin();

// How long after an action the same thing isn't proposed again.
const COOL_DOWN_DAYS: Record<ActionType, number> = {
  driver_alert: 1,
  set_max_jobs: 7,
  winback_offer: 30,
  payment_reminder: 3,
  basket_nudge: 2,
  price_change: 14,
};

export interface AutopilotSettings {
  enabled: boolean;
  categories: Record<Category, boolean>;
}

interface Context {
  tenant: Row;
  input: EngineInput;
  settings: AutopilotSettings;
  customers: Map<string, { code: string; telegram?: string; email?: string; name?: string }>;
}

async function loadContext(tenantId: string): Promise<Context | null> {
  const now = new Date();
  const since = new Date(now.getTime() - 120 * DAY).toISOString();
  const { data: tenant } = await db().from("tenants").select("*").eq("id", tenantId).maybeSingle();
  if (!tenant) return null;
  const [{ data: orders }, { data: customers }, { data: offers }, { data: devices }, { data: drivers }, { data: recent }] = await Promise.all([
    db()
      .from("orders")
      .select("id, device_id, device_order_id, placed_at, completed_at, weight_kg, amount_due, status, payment_status, customer_id")
      .eq("tenant_id", tenantId)
      .gte("placed_at", since)
      .limit(5000),
    db().from("customers").select("id, customer_code, telegram_id, email, name").eq("tenant_id", tenantId),
    db().from("customer_offers").select("customer_id").eq("tenant_id", tenantId).is("redeemed_at", null).gt("expires_at", now.toISOString()),
    db().from("devices").select("device_id, customer_id, last_weight_kg, target_kg").eq("tenant_id", tenantId),
    db().from("drivers").select("id, name, telegram_chat_id, max_jobs").eq("tenant_id", tenantId),
    db().from("ai_actions").select("type, target, decided_at").eq("tenant_id", tenantId).eq("status", "EXECUTED").gte("decided_at", new Date(now.getTime() - 30 * DAY).toISOString()),
  ]);

  const people = new Map((customers ?? []).map((c: Row) => [c.id as string, { code: c.customer_code as string, telegram: (c.telegram_id as string) ?? undefined, email: (c.email as string) ?? undefined, name: (c.name as string) ?? undefined }]));
  const reachable = (id?: string | null) => !!id && !!(people.get(id)?.telegram || people.get(id)?.email);
  const open = new Set((offers ?? []).map((o: Row) => o.customer_id as string));
  const label = (o: Row) => `#${o.device_order_id}`;

  const input: EngineInput = {
    now: now.toISOString(),
    tenant: { pricePerKg: Number(tenant.price_per_kg), winbackPct: Number(tenant.winback_pct ?? 10) },
    guardrails: {
      maxDiscount: Number(tenant.ai_max_discount ?? 20),
      priceMin: tenant.ai_price_min != null ? Number(tenant.ai_price_min) : undefined,
      priceMax: tenant.ai_price_max != null ? Number(tenant.ai_price_max) : undefined,
      priceStepPct: Number(tenant.ai_price_step_pct ?? 5),
    },
    orders: (orders ?? []).map((o: Row) => ({
      placedAt: o.placed_at as string,
      completedAt: (o.completed_at as string) ?? undefined,
      weightKg: Number(o.weight_kg),
      amount: Number(o.amount_due),
      status: o.status as string,
      paid: o.payment_status === "PAID",
      customerId: (o.customer_id as string) ?? undefined,
    })),
    customers: [...people.entries()].map(([id, p]) => ({ id, code: p.code, reachable: reachable(id), openOffer: open.has(id) })),
    unpaid: (orders ?? [])
      .filter((o: Row) => o.status === "COMPLETED" && o.payment_status === "UNPAID" && Number(o.amount_due) > 0 && o.completed_at)
      .map((o: Row) => ({
        orderId: o.id as string,
        label: label(o),
        customerId: (o.customer_id as string) ?? undefined,
        customerCode: people.get(o.customer_id as string)?.code,
        amount: Number(o.amount_due),
        completedAt: o.completed_at as string,
        reachable: reachable(o.customer_id as string),
      })),
    baskets: (devices ?? [])
      .filter((d: Row) => d.target_kg && d.last_weight_kg != null)
      .map((d: Row) => ({
        deviceId: d.device_id as string,
        customerId: (d.customer_id as string) ?? undefined,
        customerCode: people.get(d.customer_id as string)?.code,
        fillPct: (Number(d.last_weight_kg) / Number(d.target_kg)) * 100,
        reachable: !!people.get(d.customer_id as string)?.telegram,
      })),
    drivers: (drivers ?? []).map((d: Row) => ({ id: d.id as string, name: d.name as string, connected: !!d.telegram_chat_id, maxJobs: Number(d.max_jobs ?? 3) })),
    recent: (recent ?? [])
      .filter((r: Row) => now.getTime() - new Date(r.decided_at as string).getTime() < COOL_DOWN_DAYS[r.type as ActionType] * DAY)
      .map((r: Row) => `${r.type}:${r.target}`),
  };
  const settings: AutopilotSettings = {
    enabled: !!tenant.autopilot_enabled,
    categories: {
      staffing: tenant.autopilot_staffing !== false,
      winback: tenant.autopilot_winback !== false,
      nudges: tenant.autopilot_nudges !== false,
      pricing: !!tenant.autopilot_pricing,
    },
  };
  return { tenant, input, settings, customers: people };
}

const autoCategories = (s: AutopilotSettings) => (s.enabled ? (Object.keys(s.categories) as Category[]).filter((c) => s.categories[c]) : []);

/** Deep analytics for one business (forecast with backtest, segments, money, areas, drivers, anomalies). */
export async function businessInsights(tenantId: string): Promise<Insights> {
  const since = new Date(Date.now() - 180 * DAY).toISOString();
  const [{ data: orders }, { data: customers }, { data: devices }, { data: drivers }] = await Promise.all([
    db()
      .from("orders")
      .select("id, placed_at, assigned_at, completed_at, weight_kg, amount_due, status, payment_status, payment_confirmed_at, customer_id, device_id, driver_id, declined_by")
      .eq("tenant_id", tenantId)
      .gte("placed_at", since)
      .limit(10000),
    db().from("customers").select("id, customer_code").eq("tenant_id", tenantId),
    db().from("devices").select("device_id, area").eq("tenant_id", tenantId),
    db().from("drivers").select("name, telegram_chat_id").eq("tenant_id", tenantId),
  ]);
  return computeInsights({
    now: new Date().toISOString(),
    orders: (orders ?? []).map((o: Row) => ({
      id: o.id as string,
      placedAt: o.placed_at as string,
      assignedAt: (o.assigned_at as string) ?? undefined,
      completedAt: (o.completed_at as string) ?? undefined,
      weightKg: Number(o.weight_kg),
      amount: Number(o.amount_due),
      status: o.status as string,
      paymentStatus: o.payment_status as string,
      paymentConfirmedAt: (o.payment_confirmed_at as string) ?? undefined,
      customerId: (o.customer_id as string) ?? undefined,
      deviceId: o.device_id as string,
      driverId: (o.driver_id as string) ?? undefined,
      declinedBy: (o.declined_by as string[]) ?? [],
    })),
    customers: (customers ?? []).map((c: Row) => ({ id: c.id as string, code: c.customer_code as string })),
    devices: (devices ?? []).map((d: Row) => ({ deviceId: d.device_id as string, area: (d.area as string) ?? undefined })),
    drivers: (drivers ?? []).map((d: Row) => ({ name: d.name as string, chatId: (d.telegram_chat_id as string) ?? undefined })),
  });
}

/** Runs a full analysis for one business. Returns the run id. */
export async function runAnalysis(tenantId: string, trigger: "daily" | "manual"): Promise<{ runId: number; by: "ai" | "rules"; actions: number; executed: number } | null> {
  const ctx = await loadContext(tenantId);
  if (!ctx) return null;
  const analysis = analyze(ctx.input);
  const insights = await businessInsights(tenantId);
  const fallback = rulesBriefing(analysis, insights);

  let by: "ai" | "rules" = "rules";
  let briefing = fallback;
  let actions: Candidate[] = analysis.candidates;
  let error: string | undefined;
  let model: string | undefined;
  if (geminiEnabled()) {
    try {
      const analytics = insightsSummary(insights);
      const { data: answer, model: used } = await geminiJson<BrainAnswer>({
        system: BRAIN_SYSTEM,
        prompt: brainPrompt(analysis, {
          business: ctx.tenant.name as string,
          pricePerKg: ctx.input.tenant.pricePerKg,
          maxDiscount: ctx.input.guardrails.maxDiscount,
          priceStepPct: ctx.input.guardrails.priceStepPct,
          autopilot: autoCategories(ctx.settings),
          analytics,
        }),
        schema: BRAIN_SCHEMA,
      });
      briefing = cleanBriefing(answer, fallback);
      actions = applyDecisions(analysis.candidates, answer.decisions, ctx.input);
      by = "ai";
      model = used;
    } catch (err) {
      error = redact(err instanceof Error ? err.message : String(err));
      logError("Toss AI: Gemini failed, using rules", error);
    }
  }

  const report: Report = { ...briefing, kpis: analysis.kpis, forecast: analysis.forecast, health: analysis.health, by, model };
  const { data: run, error: runError } = await db()
    .from("ai_runs")
    .insert({ tenant_id: tenantId, trigger, source: by, model: report.model ?? null, report, error: error ?? null })
    .select("id")
    .single();
  if (runError) throw runError;

  // The newest run replaces the previous run's open suggestions.
  await db().from("ai_actions").update({ status: "EXPIRED", decided_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("status", "SUGGESTED");
  let executed = 0;
  if (actions.length) {
    const { data: rows } = await db()
      .from("ai_actions")
      .insert(
        actions.map((a) => ({
          tenant_id: tenantId,
          run_id: run.id,
          type: a.type,
          target: a.target,
          label: a.label,
          params: a.params,
          reason: a.reason,
          impact: a.impact,
          priority: a.priority,
        })),
      )
      .select("id, type");
    const auto = new Set(autoCategories(ctx.settings));
    for (const r of rows ?? []) {
      if (!auto.has(CATEGORY_OF[r.type as ActionType])) continue;
      const res = await executeAction(r.id as number, { auto: true, ctx });
      if (res.ok) executed++;
    }
  }
  return { runId: run.id as number, by, actions: actions.length, executed };
}

/** Executes one queued action (from the autopilot or the manager's Approve). */
export async function executeAction(actionId: number, o: { auto: boolean; tenantId?: string; ctx?: Context }): Promise<{ ok: boolean; result: string }> {
  const { data: a } = await db().from("ai_actions").select("*").eq("id", actionId).maybeSingle();
  if (!a || a.status !== "SUGGESTED" || (o.tenantId && a.tenant_id !== o.tenantId)) return { ok: false, result: "This action is no longer pending." };
  const ctx = o.ctx ?? (await loadContext(a.tenant_id as string));
  if (!ctx) return { ok: false, result: "Business not found." };

  let ok = false;
  let result = "";
  try {
    ({ ok, result } = await perform(a, ctx));
  } catch (err) {
    result = redact(err instanceof Error ? err.message : String(err));
  }
  await db()
    .from("ai_actions")
    .update({ status: ok ? "EXECUTED" : "FAILED", auto: o.auto, result: result.slice(0, 300), decided_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("status", "SUGGESTED");
  return { ok, result };
}

async function perform(a: Row, ctx: Context): Promise<{ ok: boolean; result: string }> {
  const p = (a.params ?? {}) as Record<string, string | number>;
  const note = p.message ? `\n\n<i>${esc(String(p.message))}</i>` : "";
  const business = esc(ctx.tenant.name as string);
  const tenantId = ctx.tenant.id as string;

  switch (a.type as ActionType) {
    case "driver_alert": {
      const token = process.env.TELEGRAM_DRIVER_BOT_TOKEN;
      const { data: drivers } = await db().from("drivers").select("telegram_chat_id").eq("tenant_id", tenantId).not("telegram_chat_id", "is", null);
      if (!token || !drivers?.length) return { ok: false, result: "No connected drivers to alert." };
      let sent = 0;
      for (const d of drivers) {
        await sendMessage(
          token,
          d.telegram_chat_id as string,
          `📈 <b>Busy day ahead</b>\n━━━━━━━━━━━━━━\n${esc(String(p.weekday))} ${esc(String(p.date))}: about <b>${p.expectedOrders} pickups</b> expected for ${business}.${note}\n\nPlease be 🟢 <b>Online</b> and share your live location.`,
        )
          .then(() => sent++)
          .catch(() => {});
      }
      return { ok: sent > 0, result: `Alert sent to ${sent} of ${drivers.length} driver(s).` };
    }
    case "set_max_jobs": {
      const to = Math.min(9, Math.max(1, Number(p.to)));
      const { data } = await db().from("drivers").update({ max_jobs: to }).eq("id", a.target as string).eq("tenant_id", tenantId).select("id");
      return data?.length ? { ok: true, result: `${p.driverName} can now carry ${to} pickups at once.` } : { ok: false, result: "Driver not found." };
    }
    case "winback_offer": {
      const who = ctx.customers.get(a.target as string);
      if (!who) return { ok: false, result: "Customer is no longer with your business." };
      const pct = Math.min(Number(ctx.tenant.ai_max_discount ?? 20), Math.max(1, Number(p.pct)));
      const { count } = await db().from("customer_offers").select("id", { count: "exact", head: true }).eq("customer_id", a.target as string).eq("tenant_id", tenantId).is("redeemed_at", null).gt("expires_at", new Date().toISOString());
      if (count) return { ok: false, result: "They already have an open offer." };
      const expires = new Date(Date.now() + 14 * DAY).toISOString();
      const { error } = await db().from("customer_offers").insert({ tenant_id: tenantId, customer_id: a.target, percent: pct, reason: "AI", expires_at: expires, notified_at: new Date().toISOString() });
      if (error) throw error;
      const until = new Date(expires).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
      const told = who.telegram
        ? await tellCustomer(who.telegram, `🎁 <b>A treat from ${business}</b>\n━━━━━━━━━━━━━━\nYour next pickup is <b>${pct}% off</b>.${note}\n\n🧺 Just fill your basket. The discount is applied automatically.\n⏳ Valid until <b>${until}</b>.`)
        : false;
      return { ok: true, result: `${pct}% offer created for ${who.code}${told ? " and sent in Toss Control" : " (shown on their dashboard)"}.` };
    }
    case "payment_reminder": {
      const { data: o } = await db().from("orders").select("payment_status, amount_due, device_order_id, customer_id").eq("id", a.target as string).eq("tenant_id", tenantId).maybeSingle();
      if (!o || o.payment_status !== "UNPAID") return { ok: false, result: "Already paid or no longer due." };
      const who = ctx.customers.get(o.customer_id as string);
      if (!who) return { ok: false, result: "Customer not found." };
      const amount = Math.round(Number(o.amount_due));
      const viaBot = who.telegram
        ? await tellCustomer(who.telegram, `🧾 <b>Friendly reminder</b>\n━━━━━━━━━━━━━━\nPickup #${o.device_order_id} from ${business}: <b>₹${amount}</b> is due.${note}\n\nTap <b>📱 Open Toss</b> to pay by UPI in seconds.`)
        : false;
      const viaEmail = await sendEmail(who.email, customerPaymentReminder({ business: ctx.tenant.name as string, name: who.name, orderNo: Number(o.device_order_id), amount, note: p.message ? String(p.message) : undefined }));
      return viaBot || viaEmail ? { ok: true, result: `Reminded ${who.code} about ₹${amount}${viaBot ? " in Toss Control" : ""}${viaEmail ? `${viaBot ? " and" : ""} by email` : ""}.` } : { ok: false, result: "Couldn't reach the customer." };
    }
    case "basket_nudge": {
      const { data: d } = await db().from("devices").select("customer_id, last_weight_kg, target_kg").eq("device_id", a.target as string).eq("tenant_id", tenantId).maybeSingle();
      const who = d ? ctx.customers.get(d.customer_id as string) : undefined;
      if (!who?.telegram) return { ok: false, result: "Customer isn't on Telegram." };
      const fill = d?.target_kg ? Math.round((Number(d.last_weight_kg) / Number(d.target_kg)) * 100) : Number(p.fillPct);
      const sent = await tellCustomer(who.telegram, `🧺 <b>Your basket is ${fill}% full</b>\nAt ${Number(d?.target_kg ?? 0)} kg, Toss requests a pickup automatically.${note}`);
      return sent ? { ok: true, result: `Nudged ${who.code} (${fill}% full).` } : { ok: false, result: "Message failed." };
    }
    case "price_change": {
      const now = Number(ctx.tenant.price_per_kg);
      const step = Number(ctx.tenant.ai_price_step_pct ?? 5) / 100;
      const lo = Math.max(ctx.tenant.ai_price_min != null ? Number(ctx.tenant.ai_price_min) : 0, now * (1 - step));
      const hi = Math.min(ctx.tenant.ai_price_max != null ? Number(ctx.tenant.ai_price_max) : Infinity, now * (1 + step));
      const to = Math.round(Math.min(hi, Math.max(lo, Number(p.to))));
      if (to === Math.round(now)) return { ok: false, result: "Price is already there." };
      await db().from("tenants").update({ price_per_kg: to }).eq("id", tenantId);
      return { ok: true, result: `Price changed from ₹${now}/kg to ₹${to}/kg. New pickups use it.` };
    }
  }
  return { ok: false, result: "Unknown action." };
}

/** Daily cron: one analysis per active business (oldest first), within a time budget. */
export async function runAutopilotAll(budgetMs = 45_000): Promise<{ businesses: number; executed: number }> {
  const start = Date.now();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const { data: tenants } = await db().from("tenants").select("id, plan_status, trial_ends_at, paid_until");
  let businesses = 0;
  let executed = 0;
  for (const t of tenants ?? []) {
    if (Date.now() - start > budgetMs) break;
    if (!isUsable(planState({ planStatus: t.plan_status, trialEndsAt: t.trial_ends_at ?? undefined, paidUntil: t.paid_until ?? undefined }).state)) continue;
    const { data: last } = await db().from("ai_runs").select("created_at").eq("tenant_id", t.id).eq("trigger", "daily").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last && new Date(new Date(last.created_at).getTime() + 330 * 60_000).toISOString().slice(0, 10) === today) continue;
    try {
      const r = await runAnalysis(t.id as string, "daily");
      businesses++;
      executed += r?.executed ?? 0;
    } catch (err) {
      logError("Toss AI daily run failed", err);
    }
  }
  return { businesses, executed };
}

/** "Ask Toss AI": a question answered from the latest numbers. */
export async function askAi(tenantId: string, question: string): Promise<string> {
  const ctx = await loadContext(tenantId);
  if (!ctx) return "I couldn't find your business.";
  const a = analyze(ctx.input);
  let answer: string;
  let model: string | null = null;
  if (!geminiEnabled()) {
    answer = "Toss AI's language model isn't connected yet. Your numbers: " + rulesBriefing(a).narrative;
  } else {
    const facts = {
      business: ctx.tenant.name,
      pricePerKg: ctx.input.tenant.pricePerKg,
      kpis: a.kpis,
      health: a.health,
      forecast: a.forecast,
      pendingActions: a.candidates.map((c) => modelSafeCandidate(c).summary),
      analytics: insightsSummary(await businessInsights(tenantId)),
      drivers: ctx.input.drivers.map((d) => ({ connected: d.connected, maxJobs: d.maxJobs })),
    };
    const reply = await geminiText({ system: ASK_SYSTEM, prompt: `BUSINESS DATA (JSON):\n${JSON.stringify(facts)}\n\nQUESTION: ${question.slice(0, 500)}` });
    answer = reply.text.replace(/[*#`]/g, "").trim().slice(0, 1500);
    model = reply.model;
  }
  await db().from("ai_runs").insert({ tenant_id: tenantId, trigger: "ask", source: model ? "ai" : "rules", model, report: { question: question.slice(0, 500), answer } });
  return answer;
}
