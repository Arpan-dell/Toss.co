import "server-only";
import { devicePoint, dispatchOrder, dispatchRoundTrip } from "./dispatch/service";
import { logError } from "./log";
import { applyOfferToOrder } from "./offers";
import { DISPATCH_LEAD_MS, firstRoundAt, isDue, nextRoundAt, phoneDeviceId, planRoundTrips, roundDeviceId, roundOpen, webDeviceId } from "./rounds";
import { supabaseAdmin } from "./supabase/admin";

// Pickups without a Toss basket (migration 0042). A booking becomes an ordinary order on a "virtual basket", so
// dispatch, weighing at the door, payment and delivery work exactly as for a basket's order. Bookings for later and
// hostel/PG rounds wait until shortly before their time (dispatchDue). Server-only: callers check who's asking.

const db = () => supabaseAdmin();
export const NEEDS_0042 = "Pickups without a basket switch on after the 0042 database update (Supabase → SQL Editor).";

export type BookingInput = {
  tenantId: string;
  source: "web" | "manager" | "round";
  address: string;
  pickupAfter: Date | null; // null: as soon as possible
  notes?: string;
  bags?: number;
  /** a customer with a Toss account (books online) */
  customer?: { id: string; code: string; telegramId?: string | null };
  /** someone without an account (the laundry booked it by phone, or a driver added them at a hostel) */
  contact?: { name?: string; phone?: string };
  /** the bill goes on this business account (a hostel that pays monthly) */
  accountId?: string | null;
  /** the hostel/PG round this bag belongs to */
  round?: { accountId: string; address: string };
};

const missingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /column/i.test(e.message ?? ""));

/** The basket row a booking hangs on. Created the first time; its address follows the latest booking. */
async function bookingDevice(i: BookingInput): Promise<string> {
  const id = i.round
    ? roundDeviceId(i.round.accountId)
    : i.customer
      ? webDeviceId(i.tenantId, i.customer.code)
      : phoneDeviceId(i.tenantId, i.contact?.phone ?? "0");
  const address = i.round?.address ?? i.address;
  const { error } = await db()
    .from("devices")
    .insert({ device_id: id, tenant_id: i.tenantId, customer_id: i.round ? null : (i.customer?.id ?? null), owner_telegram_id: i.round ? null : (i.customer?.telegramId ?? null), address });
  if (!error) return id;
  if (error.code !== "23505") throw error;
  const { data: d } = await db().from("devices").select("tenant_id, address").eq("device_id", id).maybeSingle();
  if (d && d.tenant_id !== i.tenantId) throw new Error("virtual basket belongs to another business");
  if (d && d.address !== address) await db().from("devices").update({ address }).eq("device_id", id);
  return id;
}

async function nextNumber(deviceId: string): Promise<number> {
  const { data } = await db().from("orders").select("device_order_id").eq("device_id", deviceId).order("device_order_id", { ascending: false }).limit(1);
  return ((data?.[0]?.device_order_id as number | undefined) ?? 0) + 1;
}

/** Books a pickup. Given to a driver straight away when it's for now; otherwise when its time comes up. */
export async function createBooking(i: BookingInput): Promise<{ id: string; number: number; dispatched: boolean } | { error: string }> {
  let deviceId: string;
  try {
    deviceId = await bookingDevice(i);
  } catch (err) {
    logError("booking basket failed", err);
    return { error: "Couldn't book the pickup. Try again in a moment." };
  }
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const n = await nextNumber(deviceId);
    const id = `${deviceId}#${n}`;
    const { error } = await db()
      .from("orders")
      .insert({
        id,
        device_order_id: n,
        device_id: deviceId,
        tenant_id: i.tenantId,
        customer_id: i.customer?.id ?? null,
        customer_telegram_id: i.customer?.telegramId ?? null,
        address: i.address.slice(0, 300),
        weight_kg: 0, // weighed at the door
        status: "PENDING",
        payment_status: "UNPAID",
        amount_due: 0,
        placed_at: now,
        source: i.source,
        pickup_after: i.pickupAfter?.toISOString() ?? null,
        notes: i.notes?.slice(0, 300) || null,
        bags: i.bags ?? null,
        contact_name: i.contact?.name?.slice(0, 80) || null,
        contact_phone: i.contact?.phone ?? null,
        account_id: i.accountId ?? null,
        round_account_id: i.round?.accountId ?? null,
      });
    if (error?.code === "23505") continue; // two bookings at once took the same number: take the next
    if (missingColumn(error)) return { error: NEEDS_0042 };
    if (error) {
      logError("booking failed", error);
      return { error: "Couldn't book the pickup. Try again in a moment." };
    }
    await db().from("order_events").insert({ order_id: id, device_id: deviceId, type: `booked_${i.source}`, at: now, payload: { pickupAfter: i.pickupAfter?.toISOString() ?? null } });
    await applyOfferToOrder(id);
    // rounds are given out together (dispatchDue); a booking for now goes out at once
    const dispatched = !i.round && isDue(i.pickupAfter?.toISOString(), new Date()) ? (await dispatchOrder(id).catch(() => ({ assigned: false }))).assigned : false;
    return { id, number: n, dispatched };
  }
  return { error: "Couldn't book the pickup. Try again in a moment." };
}

/** Cancels a booking that no driver has yet. */
export async function cancelBooking(orderId: string, owner: { customerId?: string; tenantId?: string }): Promise<boolean> {
  let q = db().from("orders").update({ status: "CANCELLED" }).eq("id", orderId).eq("status", "PENDING").is("driver_id", null).neq("source", "basket");
  if (owner.customerId) q = q.eq("customer_id", owner.customerId);
  if (owner.tenantId) q = q.eq("tenant_id", owner.tenantId);
  const { data } = await q.select("id");
  return !!data?.length;
}

// ---------- hostel / PG rounds ----------

export type Round = {
  id: string;
  name: string;
  address: string;
  everyDays: number;
  time: string;
  nextAt: string | null;
  cutoffMinutes: number;
  billing: "account" | "resident";
};

const toRound = (a: Record<string, unknown>): Round => ({
  id: a.id as string,
  name: a.name as string,
  address: (a.address as string) || (a.name as string),
  everyDays: Number(a.round_every_days) || 0,
  time: (a.round_time as string) || "10:00",
  nextAt: (a.round_next_at as string) ?? null,
  cutoffMinutes: Number(a.round_cutoff_minutes ?? 60),
  billing: a.billing === "resident" ? "resident" : "account",
});

/** A business account's round settings (null before 0042 or if the account isn't this business's). */
export async function getRound(accountId: string, tenantId: string): Promise<Round | null> {
  const { data, error } = await db()
    .from("business_accounts")
    .select("id, tenant_id, name, address, round_every_days, round_time, round_next_at, round_cutoff_minutes, billing")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data || data.tenant_id !== tenantId) return null;
  return toRound(data);
}

/** Every account of a business that has rounds (for residents to pick theirs). */
export async function listRounds(tenantId: string): Promise<Round[]> {
  const { data, error } = await db()
    .from("business_accounts")
    .select("id, name, address, round_every_days, round_time, round_next_at, round_cutoff_minutes, billing")
    .eq("tenant_id", tenantId)
    .not("round_every_days", "is", null)
    .order("name");
  return error ? [] : (data ?? []).map(toRound);
}

/** Saves an account's address, round schedule and who pays. A new schedule starts at the next time that's ahead. */
export async function saveRound(
  accountId: string,
  tenantId: string,
  r: { address: string; everyDays: number; time: string; cutoffMinutes: number; billing: "account" | "resident"; timezone: string },
): Promise<string | null> {
  const next = r.everyDays > 0 ? firstRoundAt(r.time, r.timezone, new Date(), r.cutoffMinutes * 60_000).toISOString() : null;
  const { error } = await db()
    .from("business_accounts")
    .update({
      address: r.address || null,
      round_every_days: r.everyDays > 0 ? r.everyDays : null,
      round_time: r.everyDays > 0 ? r.time : null,
      round_next_at: next,
      round_cutoff_minutes: r.cutoffMinutes,
      billing: r.billing,
    })
    .eq("id", accountId)
    .eq("tenant_id", tenantId);
  if (missingColumn(error)) return NEEDS_0042;
  return error ? "Couldn't save the round. Try again." : null;
}

/** A resident's bag for the next round, if they signed up. */
export async function roundBagOf(customerId: string, accountId: string): Promise<{ id: string; status: string; number: number } | null> {
  const { data } = await db()
    .from("orders")
    .select("id, status, device_order_id")
    .eq("customer_id", customerId)
    .eq("round_account_id", accountId)
    .in("status", ["PENDING", "ACCEPTED"])
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, status: data.status as string, number: data.device_order_id as number } : null;
}

/** A resident signs up for the next round ("I have clothes this time"), until the cut-off. */
export async function joinRound(
  round: Round,
  tenantId: string,
  resident: { id: string; code: string; telegramId?: string | null; room?: string | null; name?: string | null },
): Promise<{ error?: string; message?: string }> {
  if (!round.nextAt) return { error: "This hostel has no collection scheduled yet." };
  const at = new Date(round.nextAt);
  if (!roundOpen(at, round.cutoffMinutes, new Date())) return { error: "Sign-ups for this collection have closed. You can join the next one." };
  if (await roundBagOf(resident.id, round.id)) return { message: "You're already on this collection." };
  const r = await createBooking({
    tenantId,
    source: "round",
    address: [round.name, resident.room ? `Room ${resident.room}` : null].filter(Boolean).join(", "),
    pickupAfter: at,
    customer: { id: resident.id, code: resident.code, telegramId: resident.telegramId },
    accountId: round.billing === "account" ? round.id : null,
    round: { accountId: round.id, address: round.address },
  });
  return "error" in r ? { error: r.error } : { message: "You're on the next collection. Leave your bag ready at the usual spot." };
}

let lastDue = 0;

/**
 * Gives out what has become due: hostel rounds (every bag to one driver, as one stop) and bookings for a time slot.
 * Runs from basket pings, the driver bot, the live board, the cron endpoints and the daily job (each instance at
 * most once a minute, unless forced). A round moves on to its next date when it goes out.
 */
export async function dispatchDue(opts: { force?: boolean } = {}): Promise<{ rounds: number; pickups: number }> {
  const out = { rounds: 0, pickups: 0 };
  if (!opts.force && Date.now() - lastDue < 60_000) return out;
  lastDue = Date.now();
  const now = new Date();
  const soon = new Date(now.getTime() + DISPATCH_LEAD_MS).toISOString();

  // 1. rounds whose time has come: move each to its next date (claimed, so two runs don't both send it)
  const { data: due, error } = await db()
    .from("business_accounts")
    .select("id, tenant_id, round_every_days, round_time, round_next_at")
    .not("round_next_at", "is", null)
    .lte("round_next_at", soon);
  if (error) return out; // before 0042
  for (const a of due ?? []) {
    const { data: t } = await db().from("tenants").select("timezone").eq("id", a.tenant_id).maybeSingle();
    const next = a.round_every_days && a.round_time ? nextRoundAt(new Date(a.round_next_at as string), Number(a.round_every_days), a.round_time as string, (t?.timezone as string) || "Asia/Kolkata", now) : null;
    await db().from("business_accounts").update({ round_next_at: next?.toISOString() ?? null }).eq("id", a.id).eq("round_next_at", a.round_next_at);
  }

  // 2. round bags waiting for a driver (this round's, or an earlier one that found no driver), hostel by hostel
  const { data: bags } = await db()
    .from("orders")
    .select("id, round_account_id, tenant_id")
    .eq("status", "PENDING")
    .is("driver_id", null)
    .not("round_account_id", "is", null)
    .lte("pickup_after", soon)
    .limit(200);
  const byRound = new Map<string, string[]>();
  for (const b of bags ?? []) byRound.set(b.round_account_id as string, [...(byRound.get(b.round_account_id as string) ?? []), b.id as string]);
  // hostels of the same laundry that are due together: one driver goes on from one to the next while the bags fit
  const byTenant = new Map<string, { account: { id: string; name: string; tenantId: string; address: string }; orderIds: string[] }[]>();
  for (const [accountId, ids] of byRound) {
    const { data: a } = await db().from("business_accounts").select("id, tenant_id, name, address").eq("id", accountId).maybeSingle();
    if (!a) continue;
    const stop = { account: { id: a.id as string, name: a.name as string, tenantId: a.tenant_id as string, address: (a.address as string) || (a.name as string) }, orderIds: ids };
    byTenant.set(stop.account.tenantId, [...(byTenant.get(stop.account.tenantId) ?? []), stop]);
  }
  for (const stops of byTenant.values()) {
    const points = await Promise.all(stops.map((s) => devicePoint(roundDeviceId(s.account.id)).catch(() => undefined)));
    const trips = planRoundTrips(stops.map((s, i) => ({ id: s.account.id, bags: s.orderIds.length, point: points[i] })));
    for (const trip of trips) {
      const ordered = trip.map((id) => stops.find((s) => s.account.id === id)!);
      const who = await dispatchRoundTrip(ordered).catch((err) => {
        logError("round dispatch failed", err);
        return null;
      });
      if (who) out.rounds += ordered.length;
    }
  }

  // 3. single bookings whose time slot is coming up
  const { data: slots } = await db()
    .from("orders")
    .select("id")
    .eq("status", "PENDING")
    .is("driver_id", null)
    .is("round_account_id", null)
    .not("pickup_after", "is", null)
    .lte("pickup_after", soon)
    .limit(50);
  for (const o of slots ?? []) if ((await dispatchOrder(o.id as string).catch(() => ({ assigned: false }))).assigned) out.pickups++;
  return out;
}
