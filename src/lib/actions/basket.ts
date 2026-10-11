"use server";

import { BASKET_COLORS } from "@/components/site/basket-colors";
import { ownerEmail, sendEmail } from "../email/mailer";
import { customerBasketRequestReceived, ownerBasketRequest } from "../email/templates";
import { logError } from "../log";
import { normalizePhone, formatPhone } from "../phone";
import { allow, clientIp } from "../rate-limit";
import { isSupabaseConfigured, supabaseAdmin } from "../supabase/admin";
import { text, type FormState } from "./shared";

// "Get a Toss basket" from the landing page. Anyone can ask; the owner gets an email with their details
// (reply-to set to the customer) and the request is kept in basket_requests. A hidden honeypot field and a
// per-IP limit keep bots out.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function requestBasket(_prev: FormState, formData: FormData): Promise<FormState> {
  // bots fill every field, people never see this one
  if (text(formData, "company")) return { message: "Thanks! We'll be in touch soon." };

  const name = text(formData, "name").replace(/\s+/g, " ");
  const rawPhone = text(formData, "phone");
  const email = text(formData, "email").toLowerCase();
  const city = text(formData, "city").slice(0, 80);
  const message = text(formData, "message").slice(0, 500);
  const colourId = text(formData, "colour");
  const quantity = Number(text(formData, "quantity") || "1");

  if (name.length < 2 || name.length > 80) return { error: "Please enter your name." };
  // the phone is enough to reply; email is optional (only for the written confirmation)
  if (!rawPhone) return { error: "Please enter your mobile number." };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "That mobile number doesn't look right. Try 98765 43210." };
  if (email && (!EMAIL.test(email) || email.length > 254)) return { error: "That email doesn't look right." };
  if (formData.get("consent") !== "yes") return { error: "Tick the box so we can contact you about your request." };
  const colour = BASKET_COLORS.find((c) => c.id === colourId);
  if (!colour) return { error: "Pick a colour." };
  if (!(Number.isInteger(quantity) && quantity >= 1 && quantity <= 50)) return { error: "Choose how many (1 to 50)." };
  if (!(await allow("basketRequestIp", await clientIp()))) return { error: "We've already got your request. We'll be in touch soon." };

  if (isSupabaseConfigured()) {
    const { error } = await supabaseAdmin()
      .from("basket_requests")
      .insert({ name, phone, email: email || null, city: city || null, colour: colour.name, quantity, message: message || null });
    if (error) logError("saving basket request failed", error);
  }

  const details = { name, phone: formatPhone(phone), email: email || undefined, city: city || undefined, colour: colour.name, quantity, message: message || undefined };
  const sent = await sendEmail(ownerEmail(), ownerBasketRequest(details), { replyTo: email || undefined });
  if (!sent) logError("basket request email to owner not sent");
  if (email) await sendEmail(email, customerBasketRequestReceived({ name, colour: colour.name, quantity }));

  return { message: `Thanks, ${name.split(" ")[0]}! We've got your request and will call you about availability soon.${email ? ` A confirmation is on its way to ${email}.` : ""}` };
}
