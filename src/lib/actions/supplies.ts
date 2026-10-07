"use server";

import { revalidatePath } from "next/cache";
import { getTenantById } from "../data";
import { normalizePhone } from "../phone";
import { planState, tierOf } from "../plan";
import { getSession } from "../session";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";

// Supplies stock and running costs (Toss Pro). Writes run as the manager, so RLS keeps them to their business;
// the Pro check is repeated here because a page gate alone doesn't stop a direct request.
const UNITS = ["ml", "l", "g", "kg", "pcs"] as const;

async function requireProManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant || tierOf(planState(tenant).state) !== "PRO") return null;
  return session;
}
const notPro: FormState = { error: "Supplies and profit are Toss Pro features. Upgrade under Billing." };

const num = (fd: FormData, k: string) => {
  const v = text(fd, k);
  return v === "" ? 0 : Number(v);
};

export async function saveSupply(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireProManager();
  if (!session) return notPro;
  const id = text(fd, "id");
  const name = text(fd, "name").slice(0, 60);
  const unit = text(fd, "unit") as (typeof UNITS)[number];
  const perKg = num(fd, "perKg");
  const perOrder = num(fd, "perOrder");
  const lowAt = num(fd, "lowAt");
  const cost = num(fd, "costPerUnit");
  const phoneRaw = text(fd, "supplierPhone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const appliesTo = text(fd, "appliesTo") || "ALL";
  if (!["ALL", "WHITES", "COLOURED"].includes(appliesTo)) return { error: "Choose what the supply is used for." };
  if (!name) return { error: "Name the supply, like Detergent." };
  if (!UNITS.includes(unit)) return { error: "Pick a unit." };
  if (![perKg, perOrder, lowAt, cost].every((x) => Number.isFinite(x) && x >= 0 && x <= 100_000)) return { error: "Amounts must be 0 or more." };
  if (perKg === 0 && perOrder === 0) return { error: "Say how much is used per kg or per order." };
  if (phoneRaw && !phone) return { error: "That supplier number doesn't look right. Try 98765 43210." };

  const supabase = await createClient();
  const row = { name, unit, per_kg: perKg, per_order: perOrder, low_at: lowAt, cost_per_unit: cost, supplier_phone: phone, applies_to: appliesTo, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from("supplies").update(row).eq("id", id).eq("tenant_id", session.tenantId!)
    : await supabase.from("supplies").insert({ ...row, tenant_id: session.tenantId!, stock: Math.max(0, num(fd, "stock")) });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin/stock");
  return { message: id ? "Saved." : `Added ${name}. Stock now comes down with every completed pickup.` };
}

export async function restockSupply(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireProManager();
  if (!session) return notPro;
  const id = text(fd, "id");
  const qty = Number(text(fd, "qty"));
  if (!(qty > 0 && qty <= 10_000_000)) return { error: "Enter how much arrived." };
  const supabase = await createClient();
  const { data: s } = await supabase.from("supplies").select("stock, low_at").eq("id", id).eq("tenant_id", session.tenantId!).maybeSingle();
  if (!s) return { error: "Supply not found." };
  const stock = Number(s.stock) + qty;
  // back above the low level: the next drop sends a fresh alert
  const patch: Record<string, unknown> = { stock, updated_at: new Date().toISOString() };
  if (stock > Number(s.low_at)) patch.alerted_at = null;
  const { error } = await supabase.from("supplies").update(patch).eq("id", id).eq("tenant_id", session.tenantId!);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin/stock");
  return { message: "Stock updated." };
}

export async function deleteSupply(fd: FormData) {
  const session = await requireProManager();
  if (!session) return;
  const supabase = await createClient();
  await supabase.from("supplies").delete().eq("id", text(fd, "id")).eq("tenant_id", session.tenantId!);
  revalidatePath("/admin/stock");
}

export async function updateCosts(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireProManager();
  if (!session) return notPro;
  const other = num(fd, "otherCostPerKg");
  const perPickup = num(fd, "driverPayPerPickup");
  const perKm = num(fd, "driverPayPerKm");
  if (!(other >= 0 && other <= 10_000) || !(perPickup >= 0 && perPickup <= 100_000) || !(perKm >= 0 && perKm <= 10_000)) {
    return { error: "Costs must be 0 or more rupees." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ other_cost_per_kg: other, driver_pay_per_pickup: perPickup, driver_pay_per_km: perKm })
    .eq("id", session.tenantId!);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin", "layout");
  return { message: "Saved. Profit and driver pay use these costs." };
}
