"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/phone";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// One account per mobile number. Checked up front so sign-up fails with a clear message
// instead of the trigger silently dropping the duplicate number.
async function phoneTaken(phone: string) {
  if (!isSupabaseConfigured()) return false;
  const { count } = await supabaseAdmin().from("customers").select("id", { count: "exact", head: true }).eq("phone", phone);
  return (count ?? 0) > 0;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: error.code === "email_not_confirmed" ? "Confirm your email first: check your inbox for the link." : "Wrong email or password.",
    };
  }
  const role = data.user?.app_metadata?.role;
  redirect(role === "owner" ? "/owner" : role === "manager" ? "/admin" : "/app");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = text(formData, "name");
  const email = text(formData, "email");
  const phone = normalizePhone(text(formData, "phone"));
  const password = String(formData.get("password") ?? "");
  if (!name || !email) return { error: "Enter your name and email." };
  if (!phone) return { error: "Enter a valid mobile number, like 98765 43210." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (await phoneTaken(phone)) return { error: "That mobile number already has a Toss account. Sign in instead." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, phone }, emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  });
  if (error) return { error: error.message };

  // With email confirmation on, there is no session until the link is clicked.
  if (!data.session) return { message: `We sent a confirmation link to ${email}. Open it to finish signing up.` };
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
