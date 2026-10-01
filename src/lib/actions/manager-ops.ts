"use server";

import { revalidatePath } from "next/cache";
import { dispatchOrder, notifyAssignment } from "../dispatch/service";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";

// Day-to-day operations for a manager: customers, drivers, baskets and order overrides.
// Everything runs as the manager, so RLS keeps it inside their business and column grants
// limit which fields can change (see migration 0006).

async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return session;
}

const refresh = () => revalidatePath("/admin", "layout");
const TELEGRAM_ID = /^-?\d{5,20}$/;

// ---------- customers ----------

export async function removeCustomer(formData: FormData) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_customer", { p_customer: text(formData, "customerId") });
  if (error) throw new Error(friendlyError(error));
  refresh();
}

// ---------- drivers ----------

export async function addDriver(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const name = text(formData, "name");
  const chatId = text(formData, "chatId");
  if (name.length < 2 || name.length > 60) return { error: "Enter the driver's name." };
  if (!TELEGRAM_ID.test(chatId)) return { error: "Enter the driver's numeric Telegram chat ID." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("drivers")
    .insert({ tenant_id: session.tenantId, name, telegram_chat_id: chatId, status: "AVAILABLE" });
  if (error) {
    return { error: error.code === "23505" ? "That Telegram chat ID is already registered as a driver." : friendlyError(error) };
  }
  refresh();
  return { message: `${name} added. Their Accept/Complete taps in the driver bot now show under their name.` };
}

export async function setDriverMaxJobs(formData: FormData) {
  await requireManager();
  const maxJobs = Number(text(formData, "maxJobs"));
  if (!(Number.isInteger(maxJobs) && maxJobs >= 1 && maxJobs <= 9)) throw new Error("Pick 1–9 pickups");
  const supabase = await createClient();
  const { error } = await supabase.from("drivers").update({ max_jobs: maxJobs }).eq("id", text(formData, "driverId"));
  if (error) throw new Error(friendlyError(error));
  refresh();
}

export async function setDriverStatus(formData: FormData) {
  await requireManager();
  const status = text(formData, "status");
  if (!["AVAILABLE", "ON_JOB", "OFFLINE"].includes(status)) throw new Error("Invalid status");
  const supabase = await createClient();
  const { error } = await supabase.from("drivers").update({ status }).eq("id", text(formData, "driverId"));
  if (error) throw new Error(friendlyError(error));
  refresh();
}

export async function deleteDriver(formData: FormData) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.from("drivers").delete().eq("id", text(formData, "driverId"));
  if (error) throw new Error(friendlyError(error));
  refresh();
}

// ---------- baskets ----------

export async function updateBasket(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireManager();
  const area = text(formData, "area");
  const address = text(formData, "address");
  const targetRaw = text(formData, "targetKg");
  const target = targetRaw ? Number(targetRaw) : null;
  if (area.length > 60) return { error: "Keep the label under 60 characters." };
  if (address.length > 300) return { error: "That address is too long." };
  if (target !== null && !(target > 0 && target <= 200)) return { error: "Target must be between 0 and 200 kg." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devices")
    .update({ area: area || null, address: address || null, target_kg: target })
    .eq("device_id", text(formData, "deviceId"))
    .select("device_id");
  if (error || !data?.length) return { error: friendlyError(error) };
  refresh();
  return { message: "Basket updated." };
}

// ---------- order overrides ----------

export async function assignDriver(formData: FormData) {
  await requireManager();
  const chatId = text(formData, "driverChatId");
  const supabase = await createClient();
  const orderId = text(formData, "orderId");
  const { data: order } = await supabase.from("orders").select("status, accepted_at").eq("id", orderId).maybeSingle();
  const patch: Record<string, unknown> = { driver_id: chatId || null };
  // Assigning a driver to a waiting pickup also marks it accepted, like tapping Accept in the bot.
  if (chatId && order?.status === "PENDING") Object.assign(patch, { status: "ACCEPTED", accepted_at: new Date().toISOString() });
  const { data: updated, error } = await supabase.from("orders").update(patch).eq("id", orderId).select("id");
  if (error || !updated?.length) throw new Error(friendlyError(error));
  // Tell the driver on Telegram, with the pickup pin and map buttons (no-op without the driver bot).
  if (chatId) {
    const { data: full } = await supabaseAdmin().from("orders").select("*").eq("id", orderId).maybeSingle();
    if (full) await notifyAssignment(full, chatId).catch((e) => console.error("notify failed", e));
  }
  refresh();
}

// Finds the nearest available driver for a waiting pickup, like a new order from a basket does.
export async function autoAssign(formData: FormData) {
  await requireManager();
  const orderId = text(formData, "orderId");
  // RLS check: the manager can only see orders of their own business.
  const supabase = await createClient();
  const { data: mine } = await supabase.from("orders").select("id").eq("id", orderId).maybeSingle();
  if (!mine) throw new Error("Order not found");
  const result = await dispatchOrder(orderId);
  refresh();
  if (!result.assigned) throw new Error(`Couldn't auto-assign: ${result.reason}.`);
}

export async function setOrderStatus(formData: FormData) {
  await requireManager();
  const status = text(formData, "status");
  if (!["ACCEPTED", "COMPLETED", "CANCELLED"].includes(status)) throw new Error("Invalid status");
  const supabase = await createClient();
  const orderId = text(formData, "orderId");
  const { data: order } = await supabase.from("orders").select("accepted_at, completed_at").eq("id", orderId).maybeSingle();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status !== "CANCELLED" && !order?.accepted_at) patch.accepted_at = now;
  if (status === "COMPLETED" && !order?.completed_at) patch.completed_at = now;
  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw new Error(friendlyError(error));
  refresh();
}
