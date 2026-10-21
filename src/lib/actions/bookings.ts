"use server";

import { revalidatePath } from "next/cache";
import { cancelBooking, createBooking, getRound, joinRound, NEEDS_0042, saveRound } from "../bookings";
import { getTenantById } from "../data";
import { normalizePhone } from "../phone";
import { planState, tierOf } from "../plan";
import { allow } from "../rate-limit";
import { countryOf } from "../regions";
import { parseSlot } from "../rounds";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { text, type FormState } from "./shared";

// Booking pickups without a basket, and hostel/PG rounds (migration 0042). Each action checks the signed-in person
// first; the writes then run on the server (bookings.ts), limited to that person's own business or account.

type Customer = {
  id: string;
  code: string;
  tenantId: string | null;
  name: string | null;
  phone: string | null;
  telegramId: string | null;
  accountId: string | null;
  room: string | null;
};

async function me(): Promise<Customer | null> {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") return null;
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select("id, customer_code, tenant_id, name, phone, telegram_id, account_id, room")
    .eq("id", session.userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    code: data.customer_code as string,
    tenantId: (data.tenant_id as string) ?? null,
    name: (data.name as string) ?? null,
    phone: (data.phone as string) ?? null,
    telegramId: (data.telegram_id as string) ?? null,
    accountId: (data.account_id as string) ?? null,
    room: (data.room as string) ?? null,
  };
}

const refresh = () => {
  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
};

// ---------- customers ----------

/** Customer: book a pickup now or for a time slot. One open pickup at a time; the driver weighs it at the door. */
export async function bookPickup(_prev: FormState, fd: FormData): Promise<FormState> {
  const c = await me();
  if (!c) return { error: "Please sign in again." };
  if (!c.tenantId) return { error: "Join your laundry first (Find a laundry)." };
  if (!c.phone) return { error: "Add your mobile number in Settings first, so the driver can call you when they arrive." };
  if (!(await allow("booking", c.id))) return { error: "That's a lot of bookings. Try again in an hour." };
  const address = text(fd, "address");
  if (address.length < 6 || address.length > 300) return { error: "Enter the full pickup address (house, street, area)." };
  const tenant = await getTenantById(c.tenantId);
  if (!tenant) return { error: "Your laundry wasn't found." };
  const slot = parseSlot(text(fd, "when"), tenant.timezone || "Asia/Kolkata", new Date());
  if ("error" in slot) return { error: slot.error };
  const bags = Number(text(fd, "bags")) || undefined;

  const { data: open } = await supabaseAdmin().from("orders").select("id").eq("customer_id", c.id).in("status", ["PENDING", "ACCEPTED"]).limit(1);
  if (open?.length) return { error: "You already have a pickup on the way. Book the next one once it's collected." };

  const r = await createBooking({
    tenantId: c.tenantId,
    source: "web",
    address,
    pickupAfter: slot.at,
    notes: text(fd, "notes"),
    bags: bags && bags >= 1 && bags <= 20 ? bags : undefined,
    customer: { id: c.id, code: c.code, telegramId: c.telegramId },
  });
  if ("error" in r) return { error: r.error };
  refresh();
  if (slot.at) return { message: `Booked. A driver will come at the time you chose. Pickup #${r.number}.` };
  return { message: r.dispatched ? `Booked. A driver is on the way. Pickup #${r.number}.` : `Booked (pickup #${r.number}). We'll send it to the next driver who's free.` };
}

/** Customer: cancel a booking that no driver has taken yet. */
export async function cancelMyBooking(fd: FormData): Promise<void> {
  const c = await me();
  if (!c) return;
  await cancelBooking(text(fd, "orderId"), { customerId: c.id });
  refresh();
}

/** Customer: say which hostel or PG they live in (one their laundry serves), and their room. */
export async function chooseHostel(_prev: FormState, fd: FormData): Promise<FormState> {
  const c = await me();
  if (!c?.tenantId) return { error: "Join your laundry first." };
  const accountId = text(fd, "accountId");
  const room = text(fd, "room").slice(0, 20);
  if (accountId) {
    const round = await getRound(accountId, c.tenantId);
    if (!round) return { error: "Choose a hostel or PG from the list." };
  }
  const { error } = await supabaseAdmin().from("customers").update({ account_id: accountId || null, room: room || null }).eq("id", c.id);
  if (error) return { error: /column/i.test(error.message) ? NEEDS_0042 : "Couldn't save. Try again." };
  refresh();
  return { message: accountId ? "Saved. You'll see each collection here and can join it with one tap." : "Removed." };
}

/** Customer: "I have clothes this time" for their hostel's next round. */
export async function joinNextRound(): Promise<FormState> {
  const c = await me();
  if (!c?.tenantId || !c.accountId) return { error: "Choose your hostel or PG first." };
  const round = await getRound(c.accountId, c.tenantId);
  if (!round) return { error: "Your hostel's collections aren't set up yet." };
  const r = await joinRound(round, c.tenantId, { id: c.id, code: c.code, telegramId: c.telegramId, room: c.room, name: c.name });
  refresh();
  return r;
}

// ---------- managers ----------

async function manager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) return null;
  const tenant = await getTenantById(session.tenantId);
  return tenant ? { session, tenant } : null;
}

/**
 * Manager: book a pickup for someone who phoned or messaged the laundry. If they already have a Toss account with
 * that number, it's booked on their account; otherwise the name and number go on the pickup for the driver.
 */
export async function bookForCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return { error: "Please sign in again." };
  const { tenant } = m;
  const phone = normalizePhone(text(fd, "phone"), countryOf(tenant.country).dial || "91");
  if (!phone) return { error: "Enter the customer's mobile number." };
  const name = text(fd, "name").slice(0, 80);
  const address = text(fd, "address");
  if (address.length < 6 || address.length > 300) return { error: "Enter the full pickup address." };
  const slot = parseSlot(text(fd, "when"), tenant.timezone || "Asia/Kolkata", new Date());
  if ("error" in slot) return { error: slot.error };
  const bags = Number(text(fd, "bags")) || undefined;

  const { data: known } = await supabaseAdmin().from("customers").select("id, customer_code, telegram_id").eq("tenant_id", tenant.id).eq("phone", phone).maybeSingle();
  const r = await createBooking({
    tenantId: tenant.id,
    source: "manager",
    address,
    pickupAfter: slot.at,
    notes: text(fd, "notes"),
    bags: bags && bags >= 1 && bags <= 20 ? bags : undefined,
    ...(known
      ? { customer: { id: known.id as string, code: known.customer_code as string, telegramId: (known.telegram_id as string) ?? null } }
      : { contact: { name: name || undefined, phone } }),
  });
  if ("error" in r) return { error: r.error };
  refresh();
  const who = known ? "their Toss account" : name || "this number";
  if (slot.at) return { message: `Booked for ${who}. It goes to a driver shortly before the time you chose.` };
  return { message: r.dispatched ? `Booked for ${who} and sent to the nearest driver.` : `Booked for ${who}. No driver is free right now; it goes out as soon as one is.` };
}

/** Manager: cancel a booking no driver has yet. */
export async function cancelBookingAsManager(fd: FormData): Promise<void> {
  const m = await manager();
  if (!m) return;
  await cancelBooking(text(fd, "orderId"), { tenantId: m.tenant.id });
  refresh();
}

/** Manager (Pro): a hostel/PG's address, how often its round runs, at what time, and who pays. */
export async function saveRoundSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return { error: "Please sign in again." };
  if (tierOf(planState(m.tenant).state) !== "PRO") return { error: "Hostel and PG rounds are part of Toss Pro. Upgrade under Billing." };
  const everyDays = Number(text(fd, "everyDays")) || 0;
  const time = text(fd, "time") || "10:00";
  const cutoffMinutes = Number(text(fd, "cutoff"));
  const address = text(fd, "address");
  if (!(everyDays >= 0 && everyDays <= 14)) return { error: "Choose how often the round runs." };
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return { error: "Choose the round's time." };
  if (!(cutoffMinutes >= 0 && cutoffMinutes <= 1440)) return { error: "Choose when sign-ups close." };
  if (everyDays > 0 && address.length < 6) return { error: "Enter the hostel's address, so drivers can find it." };
  const wrong = await saveRound(text(fd, "accountId"), m.tenant.id, {
    address: address.slice(0, 300),
    everyDays,
    time,
    cutoffMinutes,
    billing: text(fd, "billing") === "resident" ? "resident" : "account",
    timezone: m.tenant.timezone || "Asia/Kolkata",
  });
  if (wrong) return { error: wrong };
  refresh();
  return { message: everyDays > 0 ? "Saved. Residents can now sign up for each collection from their Toss account." : "Rounds are off for this account." };
}
