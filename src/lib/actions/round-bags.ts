"use server";

import { revalidatePath } from "next/cache";
import { createBooking, getRound, roundBagOf } from "../bookings";
import { giveToDriver } from "../dispatch/service";
import { getTenantById } from "../data";
import { normalizePhone } from "../phone";
import { allow } from "../rate-limit";
import { countryOf } from "../regions";
import { supabaseAdmin } from "../supabase/admin";
import { text, type FormState } from "./shared";

// A driver at a hostel adds a bag for someone who didn't sign up for the round. The driver is identified by the
// secret route token in their bot's links (no sign-in on the road); the bag joins their list straight away and is
// weighed in Toss Handy like any other.
export async function addRoundBag(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = text(fd, "token");
  const accountId = text(fd, "accountId");
  if (!/^[a-f0-9]{36}$/.test(token)) return { error: "This link isn't valid any more. Open it again from Toss Handy." };
  const db = supabaseAdmin();
  const { data: driver } = await db.from("drivers").select("id, tenant_id, telegram_chat_id").eq("route_token", token).maybeSingle();
  if (!driver?.telegram_chat_id) return { error: "This link isn't valid any more. Open it again from Toss Handy." };
  if (!(await allow("roundBag", driver.id as string))) return { error: "Too many bags added at once. Wait a few minutes." };
  const tenantId = driver.tenant_id as string;
  const round = await getRound(accountId, tenantId);
  if (!round) return { error: "This hostel isn't one of your laundry's." };
  const accountBilled = round.billing === "account" ? round.id : null;
  const chatId = driver.telegram_chat_id as string;

  const customerId = text(fd, "customerId");
  let orderId: string;
  if (customerId) {
    const { data: c } = await db
      .from("customers")
      .select("id, customer_code, telegram_id, room")
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .eq("account_id", round.id)
      .maybeSingle();
    if (!c) return { error: "That resident isn't on this hostel's list." };
    const existing = await roundBagOf(c.id as string, round.id);
    if (existing) {
      if (existing.status === "ACCEPTED") return { message: "Already on your list." };
      await giveToDriver(existing.id, chatId, { compact: true });
      revalidatePath(`/r/${token}/round/${accountId}`);
      return { message: "Added to your list. Weigh it with its ✅ Picked up button in Toss Handy." };
    }
    const r = await createBooking({
      tenantId,
      source: "round",
      address: [round.name, c.room ? `Room ${c.room}` : null].filter(Boolean).join(", "),
      pickupAfter: null,
      customer: { id: c.id as string, code: c.customer_code as string, telegramId: (c.telegram_id as string) ?? null },
      accountId: accountBilled,
      round: { accountId: round.id, address: round.address },
    });
    if ("error" in r) return { error: r.error };
    orderId = r.id;
  } else {
    const name = text(fd, "name").slice(0, 60);
    const room = text(fd, "room").slice(0, 20);
    if (name.length < 2) return { error: "Enter their name." };
    const tenant = await getTenantById(tenantId);
    const rawPhone = text(fd, "phone");
    const phone = rawPhone ? normalizePhone(rawPhone, countryOf(tenant?.country).dial || "91") : null;
    if (rawPhone && !phone) return { error: "That mobile number doesn't look right. Leave it empty if you don't have it." };
    const r = await createBooking({
      tenantId,
      source: "round",
      address: [round.name, room ? `Room ${room}` : null].filter(Boolean).join(", "),
      pickupAfter: null,
      contact: { name: room ? `${name} · Room ${room}` : name, phone: phone ?? undefined },
      accountId: accountBilled,
      round: { accountId: round.id, address: round.address },
    });
    if ("error" in r) return { error: r.error };
    orderId = r.id;
  }
  await giveToDriver(orderId, chatId, { compact: true });
  revalidatePath(`/r/${token}/round/${accountId}`);
  return { message: "Added to your list. Weigh it with its ✅ Picked up button in Toss Handy." };
}
