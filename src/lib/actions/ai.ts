"use server";

import { revalidatePath } from "next/cache";
import { askAi, executeAction, runAnalysis } from "../ai/autopilot";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";
import { logError } from "@/lib/log";

// Toss AI actions for a business manager. Runs and executions use the service role (they reach
// customers, drivers and prices), so each one first checks the caller manages this business.

async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return { ...session, tenantId: session.tenantId };
}

const refresh = () => revalidatePath("/admin/ai");
const MANUAL_RUNS_PER_DAY = 10;
const QUESTIONS_PER_DAY = 30;

async function usedToday(tenantId: string, trigger: "manual" | "ask") {
  const { count } = await supabaseAdmin()
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("trigger", trigger)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return count ?? 0;
}

export async function runAiNow(): Promise<FormState> {
  const { tenantId } = await requireManager();
  if ((await usedToday(tenantId, "manual")) >= MANUAL_RUNS_PER_DAY) return { error: "That's 10 fresh analyses today. The next one runs automatically tomorrow morning." };
  try {
    const r = await runAnalysis(tenantId, "manual");
    refresh();
    if (!r) return { error: "Business not found." };
    return {
      message: `${r.by === "ai" ? "Toss AI" : "The rules engine"} found ${r.actions} action${r.actions === 1 ? "" : "s"}${r.executed ? `; the autopilot already did ${r.executed}` : ""}.`,
    };
  } catch (err) {
    logError("manual AI run failed", err);
    return { error: "The analysis failed. Please try again in a minute." };
  }
}

export async function approveAiAction(formData: FormData) {
  const { tenantId } = await requireManager();
  // A failure is recorded on the action (status FAILED + reason), so it shows in the activity log.
  await executeAction(Number(text(formData, "id")), { auto: false, tenantId });
  refresh();
}

export async function dismissAiAction(formData: FormData) {
  const { tenantId } = await requireManager();
  await supabaseAdmin()
    .from("ai_actions")
    .update({ status: "DISMISSED", decided_at: new Date().toISOString() })
    .eq("id", Number(text(formData, "id")))
    .eq("tenant_id", tenantId)
    .eq("status", "SUGGESTED");
  refresh();
}

export async function updateAutopilot(_prev: FormState, formData: FormData): Promise<FormState> {
  const { tenantId } = await requireManager();
  const on = (k: string) => formData.get(k) === "on";
  const num = (k: string) => (text(formData, k) ? Number(text(formData, k)) : null);
  const maxDiscount = num("maxDiscount") ?? 20;
  const step = num("priceStep") ?? 5;
  const min = num("priceMin");
  const max = num("priceMax");
  if (!(Number.isInteger(maxDiscount) && maxDiscount >= 1 && maxDiscount <= 50)) return { error: "Max discount must be 1–50%." };
  if (!(Number.isInteger(step) && step >= 1 && step <= 20)) return { error: "Max price change must be 1–20% per step." };
  if ((min !== null && !(min > 0)) || (max !== null && !(max > 0)) || (min !== null && max !== null && min > max)) return { error: "Check your price limits." };
  if (on("pricing") && (min === null || max === null)) return { error: "Set a minimum and maximum price before letting the autopilot change prices." };

  // As the manager, under the column grants for these settings.
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      autopilot_enabled: on("enabled"),
      autopilot_staffing: on("staffing"),
      autopilot_winback: on("winback"),
      autopilot_nudges: on("nudges"),
      autopilot_pricing: on("pricing"),
      ai_max_discount: maxDiscount,
      ai_price_step_pct: step,
      ai_price_min: min,
      ai_price_max: max,
    })
    .eq("id", tenantId);
  if (error) return { error: friendlyError(error) };
  refresh();
  return {
    message: on("enabled")
      ? "Autopilot is ON. Toss AI acts every morning on what you switched on and logs everything it does."
      : "Saved. Toss AI will suggest actions for you to approve.",
  };
}

export async function askToss(_prev: FormState & { answer?: string; question?: string }, formData: FormData): Promise<FormState & { answer?: string; question?: string }> {
  const { tenantId } = await requireManager();
  const question = text(formData, "question");
  if (question.length < 3) return { error: "Ask a question about your business." };
  if ((await usedToday(tenantId, "ask")) >= QUESTIONS_PER_DAY) return { error: "That's 30 questions today. Ask again tomorrow." };
  try {
    return { question, answer: await askAi(tenantId, question) };
  } catch (err) {
    logError("ask failed", err);
    return { error: "Toss AI couldn't answer right now. Please try again." };
  }
}
