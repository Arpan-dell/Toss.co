"use server";

import { revalidatePath } from "next/cache";
import { dispatchDelivery, notifyDelivery, orderReady } from "../dispatch/service";
import { logError } from "../log";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";

// Deliveries back to the customer (migration 0027), from the manager's side: send an order out, choose its driver,
// close it by hand (delivered, or the customer collected it at the store), and turn delivery on or off. Delivery
// columns are written with the service role, after reading the order through RLS so it's this manager's own.
// Available on every plan: the customer is waiting for their clothes.

async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return session;
}

async function myOrder(orderId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id, status, ready_at, delivery_status, delivery_driver_id").eq("id", orderId).maybeSingle();
  if (!data) throw new Error("Order not found in your business");
  return data;
}

const done = () => revalidatePath("/admin", "layout");

// Ready orders go to the nearest driver; one that came back ("customer not home") is sent again.
export async function sendForDelivery(fd: FormData) {
  await requireManager();
  const orderId = text(fd, "orderId");
  const o = await myOrder(orderId);
  if (o.status !== "COMPLETED") throw new Error("Only picked-up orders can be delivered.");
  const db = supabaseAdmin();
  if (!o.ready_at) await db.from("orders").update({ ready_at: new Date().toISOString() }).eq("id", orderId).is("ready_at", null);
  // ready earlier with store collection (or before deliveries existed): start a delivery now, code and all
  if (!o.delivery_status) await orderReady(orderId, { deliver: true }).catch((e) => logError("delivery start failed", e));
  const r = await dispatchDelivery(orderId);
  done();
  if (!r.assigned && r.reason === "no driver available") throw new Error("No driver is online right now. It will go to the next driver who comes online, or assign one.");
}

export async function assignDeliveryDriver(fd: FormData) {
  const session = await requireManager();
  const orderId = text(fd, "orderId");
  const chatId = text(fd, "driverChatId");
  const o = await myOrder(orderId);
  if (!o.delivery_status || !["WAITING", "ASSIGNED", "OUT"].includes(o.delivery_status as string)) throw new Error("This order isn't waiting for delivery.");
  const db = supabaseAdmin();
  if (!chatId) {
    await db.from("orders").update({ delivery_driver_id: null, delivery_status: "WAITING", delivery_assigned_at: null, out_for_delivery_at: null }).eq("id", orderId);
    done();
    return;
  }
  const { data: driver } = await db.from("drivers").select("id").eq("tenant_id", session.tenantId!).eq("telegram_chat_id", chatId).maybeSingle();
  if (!driver) throw new Error("That driver isn't in your business.");
  // a new driver collects it from the store; keep OUT only when it's the same driver
  const status = o.delivery_status === "OUT" && o.delivery_driver_id === chatId ? "OUT" : "ASSIGNED";
  await db.from("orders").update({ delivery_driver_id: chatId, delivery_status: status, delivery_assigned_at: new Date().toISOString() }).eq("id", orderId);
  await db.from("drivers").update({ status: "ON_JOB" }).eq("id", driver.id as string).neq("status", "OFFLINE");
  if (o.delivery_driver_id !== chatId) {
    const { data: full } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (full) await notifyDelivery(full, chatId).catch((e) => logError("delivery notify failed", e));
  }
  done();
}

// Closes it by hand: "delivered" (e.g. the driver forgot to tap) or "collected" (the customer came to the store).
export async function closeDelivery(fd: FormData) {
  await requireManager();
  const orderId = text(fd, "orderId");
  const how = text(fd, "how") === "collected" ? "COLLECTED" : "DELIVERED";
  const o = await myOrder(orderId);
  if (o.status !== "COMPLETED") throw new Error("Only picked-up orders can be handed back.");
  if (o.delivery_status === "DELIVERED" || o.delivery_status === "COLLECTED") return;
  const now = new Date().toISOString();
  await supabaseAdmin()
    .from("orders")
    .update({ delivery_status: how, delivered_at: now, ready_at: o.ready_at ?? now, delivery_verified: null })
    .eq("id", orderId);
  done();
}

// Business page: deliver ready orders back to customers, or have them collected at the store.
export async function updateDelivers(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireManager();
  const on = fd.get("delivers") === "on";
  // not in the manager's column grants: written server-side after the role check
  const { error } = await supabaseAdmin().from("tenants").update({ delivers: on }).eq("id", session.tenantId!);
  if (error) return { error: friendlyError(error) };
  done();
  return { message: on ? "Saved. Ready orders go out for delivery with your drivers." : "Saved. Customers are told to collect ready orders at your store." };
}
