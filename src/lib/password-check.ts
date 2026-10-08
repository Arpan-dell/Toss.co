import "server-only";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { allow } from "./rate-limit";
import type { Session } from "./session";

/**
 * Important settings (where customers' money goes, the price, closing the business) need the account password
 * again, so an unlocked phone or a borrowed laptop can't change them. Checked with a separate, cookie-less sign-in
 * that's signed out straight away; the browser session is untouched. Returns an error to show, or null when it's right.
 */
export async function checkPassword(session: Session, password: string): Promise<string | null> {
  if (!session.email) return "Please sign in again.";
  if (!password) return "Enter your password to save this change.";
  if (!(await allow("sensitiveChange", session.userId))) return "Too many attempts. Try again in an hour.";
  const check = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await check.auth.signInWithPassword({ email: session.email, password });
  if (error || data.user?.id !== session.userId) {
    return error?.status === 429 ? "Too many attempts. Wait a minute and try again." : "That password is wrong. Nothing was changed.";
  }
  await check.auth.signOut({ scope: "local" });
  return null;
}
