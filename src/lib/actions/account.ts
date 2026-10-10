"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { passwordError } from "../password-rules";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import type { FormState } from "./shared";
import { logError } from "@/lib/log";
import { allow } from "../rate-limit";

// Changes the signed-in user's password after checking their current one. Works for every role.
// The current password is checked with a separate, cookie-less sign-in so the browser session is
// untouched; that check session is then signed out again.
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session?.email) return { error: "Please sign in again." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current) return { error: "Enter your current password." };
  const weak = passwordError(next);
  if (weak) return { error: weak.replace("Your password", "Your new password") };
  if (next !== confirm) return { error: "The new passwords don't match." };
  if (next === current) return { error: "Choose a password different from your current one." };

  // counts only real attempts at the current password (the guessable step), not form mistakes
  if (!(await allow("passwordChange", session.userId))) return { error: "Too many password changes. Try again in an hour." };
  const check = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await check.auth.signInWithPassword({ email: session.email, password: current });
  if (error || data.user?.id !== session.userId) {
    return { error: error?.status === 429 ? "Too many attempts. Wait a minute and try again." : "Your current password is wrong." };
  }
  await check.auth.signOut({ scope: "local" }); // drop only the check session

  const { error: updateError } = await supabaseAdmin().auth.admin.updateUserById(session.userId, { password: next });
  if (updateError) {
    logError("password change failed", updateError);
    return { error: updateError.code === "weak_password" ? "That password is too weak. Try a longer one." : "Couldn't change your password. Please try again." };
  }
  // keep this device signed in, sign out every other one (an old session may be the reason for the change)
  await (await createClient()).auth.signOut({ scope: "others" }).catch((e) => logError("signing out other devices failed", e));
  return { message: "Password changed. Other devices have been signed out." };
}
