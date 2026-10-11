"use server";

import { revalidatePath } from "next/cache";
import { ownerEmail, sendEmail } from "../email/mailer";
import { deletionRequestReceived, ownerDeletionRequest } from "../email/templates";
import { allow, clientIp } from "../rate-limit";
import { getSession } from "../session";
import { isSupabaseConfigured, supabaseAdmin } from "../supabase/admin";
import { text, type FormState } from "./shared";

// Data deletion requests (India's DPDP Act: the right to erasure). Anyone can ask from /data-deletion; signed-in
// people are linked to their account. The owner is emailed, sees the request in the owner console, deletes or
// anonymises the data, and marks it done. Invoices a laundry must keep by law are kept, with a note.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  const email = (session?.email ?? text(formData, "email")).toLowerCase();
  const name = text(formData, "name").slice(0, 80);
  const details = text(formData, "details").slice(0, 1000);
  if (!EMAIL_RE.test(email)) return { error: "Enter the email address on your Toss account." };
  if (formData.get("confirm") !== "yes") return { error: "Tick the box to confirm you want your data deleted." };
  if (!(await allow("deletionRequestIp", await clientIp()))) return { error: "Too many requests from this network. Try again in an hour." };
  if (!isSupabaseConfigured()) return { error: "Requests can't be saved right now. Email us instead." };

  const { data, error } = await supabaseAdmin()
    .from("deletion_requests")
    .insert({ user_id: session?.userId ?? null, email, name: name || null, role: session?.role ?? "not signed in", details: details || null })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save your request. Please try again, or email us." };
  const id = data.id as number;
  await Promise.all([
    sendEmail(ownerEmail(), ownerDeletionRequest({ id, email, name, role: session?.role ?? "not signed in", details }), { replyTo: email }),
    sendEmail(email, deletionRequestReceived({ id }), { replyTo: ownerEmail() }),
  ]);
  return { message: `Request #${id} received. We'll confirm by email when your data is deleted, within 30 days.` };
}

/** Owner: close a request once the data is deleted (or explain why it couldn't be). */
export async function closeDeletionRequest(formData: FormData): Promise<void> {
  const session = await getSession();
  if (session?.role !== "OWNER") return;
  const id = Number(formData.get("id"));
  const status = formData.get("status") === "REJECTED" ? "REJECTED" : "DONE";
  const note = String(formData.get("note") ?? "").slice(0, 500) || null;
  if (!Number.isInteger(id)) return;
  await supabaseAdmin().from("deletion_requests").update({ status, note, done_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/owner/privacy");
}
