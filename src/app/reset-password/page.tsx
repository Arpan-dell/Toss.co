import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { ResetForm } from "./form";

// no-referrer: the token is in this page's URL and must never leave in a Referer header
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

// Checks the link without using it, so an expired or used link says so before anyone types a password.
async function linkIsLive(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !isSupabaseConfigured()) return false;
  const { count } = await supabaseAdmin()
    .from("password_resets")
    .select("id", { count: "exact", head: true })
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());
  return (count ?? 0) > 0;
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const t = typeof token === "string" ? token : "";
  const live = await linkIsLive(t);
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo variant="full" className="h-28" />
        </Link>
        <div className="rounded-[10px] border border-t-2 border-border border-t-accent bg-surface-solid p-7">
          {live ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
              <p className="mt-1.5 mb-6 text-sm text-secondary">You&apos;ll be signed out on every device, then you can sign in with it.</p>
              <ResetForm token={t} />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
              <p className="mt-1.5 mb-6 text-sm text-secondary">Reset links work once and last 15 minutes. Ask for a new one.</p>
              <Link href="/login/forgot" className="btn-primary inline-flex rounded-full px-5 py-2.5 text-sm font-medium">
                Send a new link
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
