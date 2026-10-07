"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { orderReady } from "../dispatch/service";
import { logError } from "../log";
import { friendlyError, text, type FormState } from "./shared";

// Turnaround promise, "ready" notices and the Google review link (migration 0022). Marking an order ready is on
// every plan because the customer is waiting for it; the late list and ratings insights are Pro pages.

async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return session;
}

export async function markReady(fd: FormData) {
  const session = await requireManager();
  const orderId = text(fd, "orderId");
  const supabase = await createClient();
  // RLS + the column grant keep this to the manager's own completed orders
  const { data } = await supabase
    .from("orders")
    .update({ ready_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", session.tenantId!)
    .eq("status", "COMPLETED")
    .is("ready_at", null)
    .select("id");
  // the customer is told, and the clothes go out for delivery (or wait at the store to be collected)
  if (data?.length) await orderReady(orderId).catch((err) => logError("ready failed", err));
  revalidatePath("/admin", "layout");
}

export async function updateService(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireManager();
  const hours = Number(text(fd, "turnaroundHours"));
  const review = text(fd, "googleReviewUrl");
  if (!(Number.isInteger(hours) && hours >= 1 && hours <= 720)) return { error: "Turnaround must be 1–720 hours." };
  if (review && !/^https:\/\/\S{6,300}$/.test(review)) return { error: "Paste the full Google review link, starting with https://" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ turnaround_hours: hours, google_review_url: review || null })
    .eq("id", session.tenantId!);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin", "layout");
  return { message: "Saved. New pickups are promised in this time." };
}

// Public: the customer rates a paid order from the link in their invoice. The random token is the only key;
// one rating per order, written with the service role after checking the token.
export async function submitRating(_prev: FormState, fd: FormData): Promise<FormState & { review?: string }> {
  const token = text(fd, "token");
  const rating = Number(text(fd, "rating"));
  const comment = text(fd, "comment").slice(0, 500);
  if (!/^[a-f0-9]{32}$/.test(token)) return { error: "This rating link isn't valid." };
  if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return { error: "Tap a star to rate." };
  const db = supabaseAdmin();
  const { data } = await db
    .from("orders")
    .update({ rating, rating_comment: comment || null, rated_at: new Date().toISOString() })
    .eq("rate_token", token)
    .is("rated_at", null)
    .select("tenant_id");
  if (!data?.length) return { error: "This pickup has already been rated. Thank you!" };
  const { data: t } = await db.from("tenants").select("google_review_url").eq("id", data[0].tenant_id as string).maybeSingle();
  return { message: "Thank you for the rating!", review: rating >= 4 ? ((t?.google_review_url as string) ?? undefined) : undefined };
}

