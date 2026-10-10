"use server";

import { createHash, randomBytes } from "node:crypto";
import { passwordError } from "../password-rules";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendEmail } from "../email/mailer";
import { passwordResetEmail } from "../email/templates";
import { logError } from "../log";
import { allow, clientIp } from "../rate-limit";
import { isSupabaseConfigured, supabaseAdmin } from "../supabase/admin";
import { text, type FormState } from "./shared";

// Password reset by email. The token is 32 random bytes; only its SHA-256 hash is stored. It's tied to one
// account, expires in 15 minutes and works once (see migration 0017). Asking always gets the same answer,
// so the form can't be used to find out who has an account.

const TOKEN_MINUTES = 15;
const SENT = "If that email has a Toss account, a reset link is on its way. It expires in 15 minutes.";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return process.env.APP_URL ?? process.env.SITE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "Enter the email you signed up with." };
  if (!(await allow("resetRequestIp", await clientIp()))) return { error: "Too many reset requests. Try again in an hour." };
  if (!(await allow("resetRequestAccount", email))) return { message: SENT }; // don't reveal the limit hit on an account
  if (!isSupabaseConfigured()) return { message: SENT };

  const db = supabaseAdmin();
  const { data: userId } = await db.rpc("auth_user_id_by_email", { p_email: email });
  if (!userId) return { message: SENT };

  const token = randomBytes(32).toString("base64url");
  // one live link per account: older unused ones stop working
  await db.from("password_resets").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  const { error } = await db.from("password_resets").insert({
    user_id: userId,
    token_hash: hash(token),
    expires_at: new Date(Date.now() + TOKEN_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    logError("password reset token not saved", error);
    return { message: SENT };
  }
  const link = `${await siteOrigin()}/reset-password?token=${token}`;
  await sendEmail(email, passwordResetEmail({ link, minutes: TOKEN_MINUTES }));
  return { message: SENT };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = text(formData, "token");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { error: "This reset link isn't valid. Ask for a new one." };
  const weak = passwordError(next);
  if (weak) return { error: weak };
  if (next !== confirm) return { error: "The passwords don't match." };
  if (!(await allow("resetSubmitIp", await clientIp()))) return { error: "Too many attempts. Try again later." };

  const db = supabaseAdmin();
  const { data: userId, error } = await db.rpc("consume_password_reset", { p_hash: hash(token) });
  if (error || !userId) return { error: "This reset link has expired or was already used. Ask for a new one." };

  const { error: updateError } = await db.auth.admin.updateUserById(userId as string, { password: next });
  if (updateError) {
    logError("password reset update failed", updateError);
    return { error: updateError.code === "weak_password" ? "That password is too weak. Try a longer one." : "Couldn't save your new password. Ask for a new link." };
  }
  // whoever had the old password is signed out everywhere
  const { error: revokeError } = await db.rpc("revoke_user_sessions", { p_user: userId });
  if (revokeError) logError("revoking sessions after reset failed", revokeError);
  redirect("/login?notice=password-reset");
}

